import asyncio
import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel, model_validator

from app import db
from app.api import jobs
from app.api.auth import require_passphrase_or_key
from app.api.store import equipments_of, get_workspace, process_summary, rules_row, rules_with_issues
from app.api.uploads import read_upload
from app.config import SEED_DIR
from app.models.ticket import Ticket, TicketFile
from app.pipeline.cases import check_findings
from app.rules.yaml_io import from_yaml

router = APIRouter(prefix="/api", tags=["processes"])
# The stream takes the passphrase as a query parameter, so it carries its own guard
# instead of the router-level one.
stream_router = APIRouter(prefix="/api", tags=["processes"])


class Decision(BaseModel):
    decision: Literal["approved", "rejected", "pending"]
    note: str | None = None

    @model_validator(mode="after")
    def rejection_needs_a_note(self):
        self.note = (self.note or "").strip() or None
        if self.decision == "rejected" and not self.note:
            raise ValueError("a rejection needs a note")
        return self


async def read_text(file: UploadFile) -> str:
    raw = await read_upload(file)
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "file must be UTF-8 text")


def ticket_row(r: dict, with_trace: bool) -> dict:
    out = {
        "id": r["id"], "process_id": r["process_id"], "position": r["position"],
        "ticket": db.loads(r["ticket"]),
        "decision": r["decision"], "decision_note": r["decision_note"], "decided_at": r["decided_at"],
    }
    trace = db.loads(r["trace"], {})
    if with_trace:
        out["trace"] = trace
    else:
        out["band"] = (trace.get("urgency") or {}).get("band")
        out["equipment_type"] = (trace.get("equipment") or {}).get("equipment_type")
        out["safety_critical_element"] = (trace.get("equipment") or {}).get("safety_critical_element")
        out["overrides"] = [o["id"] for o in (trace.get("urgency") or {}).get("overrides", [])]
        out["attempts"] = len(trace.get("attempts", []))
    return out


@router.get("/examples/bravo-findings.csv", response_class=PlainTextResponse)
def bravo_findings():
    return PlainTextResponse((SEED_DIR / "bravo" / "inspection_findings.csv").read_text(encoding="utf-8"),
                             media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="inspection_findings.csv"'})


@router.post("/workspaces/{workspace_id}/processes/preview")
async def preview_process(workspace_id: str, file: UploadFile = File(...)):
    text = await read_text(file)
    with db.connect() as conn:
        get_workspace(conn, workspace_id)
        checked = check_findings(equipments_of(conn, workspace_id), text, file.filename or "findings.csv")
    return checked.summary() | {"findings": [f.to_record() for f in checked.findings]}


@router.post("/workspaces/{workspace_id}/processes", status_code=202)
async def submit_process(workspace_id: str, file: UploadFile = File(...), rules_version_id: str = Form(...)):
    text = await read_text(file)
    with db.connect() as conn:
        get_workspace(conn, workspace_id)
        row = rules_row(conn, rules_version_id)
        if row["workspace_id"] != workspace_id:
            raise HTTPException(400, "rules version belongs to another workspace")
        if row["status"] != "approved":
            raise HTTPException(409, "approve the rules version before submitting a process")
        rules, issues, parse_error = rules_with_issues(conn, row)
        if rules is None:
            raise HTTPException(422, parse_error or "rules cannot be read")
        if any(i["level"] == "error" for i in issues):
            raise HTTPException(409, "the approved rules no longer cover the assets; extract or edit a new version first")
        equipments = equipments_of(conn, workspace_id)
        if not equipments:
            raise HTTPException(409, "add assets before submitting findings")
        checked = check_findings(equipments, text, file.filename or "findings.csv")
    if not checked.ok:
        raise HTTPException(422, {"message": "the findings cannot be processed", **checked.summary()})
    pid = jobs.start_process(workspace_id, rules_version_id, rules, checked)
    with db.connect() as conn:
        return read_process_in(conn, pid)


def read_process_in(conn, process_id: str) -> dict:
    r = db.one(conn, "SELECT * FROM processes WHERE id = ?", (process_id,))
    if not r:
        raise HTTPException(404, "process not found")
    tickets = db.all_rows(conn, "SELECT * FROM tickets WHERE process_id = ? ORDER BY position", (process_id,))
    rules_yaml = db.one(conn, "SELECT yaml FROM rules_versions WHERE id = ?", (r["rules_version_id"],))
    bands = None
    if rules_yaml and rules_yaml["yaml"]:
        try:
            bands = from_yaml(rules_yaml["yaml"]).urgency_bands.model_dump()
        except ValueError:
            bands = None
    inp = db.loads(r["input"], {})
    return process_summary(r) | {
        "progress": db.loads(r["progress"], {}), "bands": bands, "input": inp,
        "tickets": [ticket_row(t, False) for t in tickets],
    }


@router.get("/processes/{process_id}")
def read_process(process_id: str):
    with db.connect() as conn:
        return read_process_in(conn, process_id)


@router.get("/processes/{process_id}/export")
def export_process(process_id: str, only: Literal["all", "approved"] = "all"):
    with db.connect() as conn:
        r = db.one(conn, "SELECT * FROM processes WHERE id = ?", (process_id,))
        if not r:
            raise HTTPException(404, "process not found")
        rows = db.all_rows(conn, "SELECT * FROM tickets WHERE process_id = ? ORDER BY position", (process_id,))
    if only == "approved":
        rows = [t for t in rows if t["decision"] == "approved"]
    tickets = [Ticket.model_validate_json(t["ticket"]) for t in rows]
    out = TicketFile(
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        tickets_generated=len(tickets),
        tickets=tickets,
    )
    return JSONResponse(
        content=out.model_dump(),
        headers={"Content-Disposition": f'attachment; filename="tickets-{process_id}.json"'},
    )


@router.get("/tickets/{ticket_id}")
def read_ticket(ticket_id: str):
    with db.connect() as conn:
        r = db.one(conn, "SELECT * FROM tickets WHERE id = ?", (ticket_id,))
        if not r:
            raise HTTPException(404, "ticket not found")
        return ticket_row(r, True)


@router.post("/tickets/{ticket_id}/decision")
def decide_ticket(ticket_id: str, body: Decision):
    with db.write() as conn:
        r = db.one(conn, "SELECT * FROM tickets WHERE id = ?", (ticket_id,))
        if not r:
            raise HTTPException(404, "ticket not found")
        decided = None if body.decision == "pending" else db.now()
        conn.execute("UPDATE tickets SET decision = ?, decision_note = ?, decided_at = ? WHERE id = ?",
                     (body.decision, (body.note or "").strip() or None, decided, ticket_id))
        return ticket_row(db.one(conn, "SELECT * FROM tickets WHERE id = ?", (ticket_id,)), True)


def event_row(r: dict) -> dict:
    return {**r, "detail": db.loads(r["detail"], {})}


def job_terminal(conn, job_id: str) -> bool | None:
    p = db.one(conn, "SELECT status FROM processes WHERE id = ?", (job_id,))
    if p:
        return p["status"] in ("done", "failed")
    r = db.one(conn, "SELECT status FROM rules_versions WHERE id = ?", (job_id,))
    if r:
        return r["status"] != "extracting"
    return None


def events_after(conn, job_id: str, after: int) -> list[dict]:
    return [event_row(r) for r in db.all_rows(
        conn, "SELECT * FROM events WHERE job_id = ? AND id > ? ORDER BY id", (job_id, after))]


@router.get("/jobs/{job_id}/events")
def read_events(job_id: str, after: int = 0):
    with db.connect() as conn:
        terminal = job_terminal(conn, job_id)
        if terminal is None:
            raise HTTPException(404, "job not found")
        return {"events": events_after(conn, job_id, after), "finished": terminal}


@stream_router.get("/jobs/{job_id}/events/stream", dependencies=[Depends(require_passphrase_or_key)])
async def stream_events(job_id: str, after: int = 0, last_event_id: str | None = Header(default=None)):
    """A reconnecting EventSource sends Last-Event-ID; the first connection sends ?after=."""
    with db.connect() as conn:
        if job_terminal(conn, job_id) is None:
            raise HTTPException(404, "job not found")
    if last_event_id and last_event_id.isdigit():
        after = max(after, int(last_event_id))

    async def generate():
        cursor = after
        while True:
            # Status flips after the last event is written, so read the status first:
            # a terminal status then guarantees the following read holds every event.
            with db.connect() as conn:
                finished = job_terminal(conn, job_id)
                rows = events_after(conn, job_id, cursor)
            for r in rows:
                cursor = r["id"]
                yield f"id: {r['id']}\nevent: stage\ndata: {json.dumps(r, ensure_ascii=False)}\n\n"
            if not rows and finished:
                yield "event: end\ndata: {}\n\n"
                return
            await asyncio.sleep(0.05 if rows else 0.3)

    return StreamingResponse(generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive",
    })
