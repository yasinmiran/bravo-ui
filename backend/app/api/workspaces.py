from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app import db
from app.api.assets import replace_assets
from app.api.store import DOCUMENT_KIND, domain_document, get_workspace, touch, workspace_detail
from app.api.uploads import read_upload
from app.config import SEED_DIR

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


class NewWorkspace(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.get("")
def list_workspaces():
    with db.connect() as conn:
        rows = db.all_rows(conn, "SELECT * FROM workspaces ORDER BY updated_at DESC")
        out = []
        for ws in rows:
            doc = db.one(conn, "SELECT 1 AS present FROM documents WHERE workspace_id = ? AND kind = ?", (ws["id"], DOCUMENT_KIND))
            assets = db.one(conn, "SELECT COUNT(*) AS n FROM assets WHERE workspace_id = ?", (ws["id"],))
            approved = db.one(conn, "SELECT COUNT(*) AS n FROM rules_versions WHERE workspace_id = ? AND status = 'approved'", (ws["id"],))
            procs = db.one(conn, """SELECT COUNT(*) AS n, MAX(started_at) AS last,
                                           SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
                                    FROM processes WHERE workspace_id = ?""", (ws["id"],))
            tickets = db.one(conn, """SELECT COUNT(*) AS n, SUM(CASE WHEN t.decision = 'pending' THEN 1 ELSE 0 END) AS pending
                                      FROM tickets t JOIN processes p ON p.id = t.process_id WHERE p.workspace_id = ?""", (ws["id"],))
            out.append(ws | {
                "has_document": bool(doc),
                "assets": assets["n"] if assets else 0,
                "approved_rules": approved["n"] if approved else 0,
                "processes": procs["n"] if procs else 0,
                "running_processes": (procs["running"] or 0) if procs else 0,
                "last_process_at": procs["last"] if procs else None,
                "tickets": tickets["n"] if tickets else 0,
                "pending_tickets": (tickets["pending"] or 0) if tickets else 0,
            })
        return out


@router.post("", status_code=201)
def create_workspace(body: NewWorkspace):
    with db.write() as conn:
        wid = db.new_id()
        stamp = db.now()
        conn.execute("INSERT INTO workspaces(id, name, created_at, updated_at) VALUES (?,?,?,?)", (wid, body.name.strip(), stamp, stamp))
        return workspace_detail(conn, wid)


@router.post("/bravo-example", status_code=201)
def create_bravo_example():
    seed = SEED_DIR / "bravo"
    with db.write() as conn:
        wid = db.new_id()
        stamp = db.now()
        conn.execute("INSERT INTO workspaces(id, name, created_at, updated_at) VALUES (?,?,?,?)", (wid, "Bravo platform (example)", stamp, stamp))
        conn.execute(
            "INSERT INTO documents(id, workspace_id, kind, filename, content, uploaded_at) VALUES (?,?,?,?,?,?)",
            (db.new_id(), wid, DOCUMENT_KIND, "domain_knowledge.md", (seed / "domain_knowledge.md").read_text(encoding="utf-8"), stamp),
        )
        replace_assets(conn, wid, (seed / "equipment_registry.csv").read_text(encoding="utf-8"))
        return workspace_detail(conn, wid)


@router.get("/{workspace_id}")
def read_workspace(workspace_id: str):
    with db.connect() as conn:
        return workspace_detail(conn, workspace_id)


@router.delete("/{workspace_id}", status_code=204)
def delete_workspace(workspace_id: str):
    with db.write() as conn:
        get_workspace(conn, workspace_id)
        conn.execute(
            """DELETE FROM events WHERE job_id IN (SELECT id FROM processes WHERE workspace_id = ?)
                                   OR job_id IN (SELECT id FROM rules_versions WHERE workspace_id = ?)""",
            (workspace_id, workspace_id))
        conn.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))


@router.put("/{workspace_id}/document")
async def upload_document(workspace_id: str, file: UploadFile = File(...)):
    raw = await read_upload(file)
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "file must be UTF-8 text")
    if not content.strip():
        raise HTTPException(400, "file is empty")
    with db.write() as conn:
        get_workspace(conn, workspace_id)
        conn.execute("DELETE FROM documents WHERE workspace_id = ? AND kind = ?", (workspace_id, DOCUMENT_KIND))
        conn.execute(
            "INSERT INTO documents(id, workspace_id, kind, filename, content, uploaded_at) VALUES (?,?,?,?,?,?)",
            (db.new_id(), workspace_id, DOCUMENT_KIND, file.filename or "domain.md", content, db.now()),
        )
        touch(conn, workspace_id)
        return workspace_detail(conn, workspace_id)


@router.get("/{workspace_id}/document")
def read_document(workspace_id: str):
    with db.connect() as conn:
        get_workspace(conn, workspace_id)
        doc = domain_document(conn, workspace_id)
        if not doc:
            raise HTTPException(404, "no domain document yet")
        return doc
