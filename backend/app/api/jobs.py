"""Long work runs in a daemon thread; the rows it updates are the job state, and
the events it writes are the story the screen tells while it runs."""

import re
import threading
import time
import logging
import os
from dataclasses import asdict

from app import db
from app.api.store import domain_document, equipments_of, next_process_number, next_version, touch
from app.config import settings
from app.llm import ModelClient, build_model
from app.models.inputs import Case, Equipment
from app.models.rules import Rules
from app.pipeline.cases import FindingsCheck, build_cases
from app.pipeline.notes import annotate_batch
from app.pipeline.run import Result, run_triage
from app.rules.extract import extract_rules
from app.rules.yaml_io import to_yaml

HEADING = re.compile(r"^#{1,6}\s+(.+)$", re.MULTILINE)

_model: ModelClient | None = None


def model() -> ModelClient:
    global _model
    if _model is None:
        if not settings.fake_model and not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is not set and TRIAGE_FAKE_MODEL is off")
        _model = build_model(settings.fake_model, settings.fake_delay)
    return _model


class Recorder:
    """Writes one event row per call. Shared by all worker threads of a job."""

    def __init__(self, job_id: str):
        self.job_id = job_id

    def __call__(self, stage: str, status: str, title: str, detail: dict | None = None, finding_id: str | None = None) -> None:
        with db.write() as conn:
            conn.execute(
                "INSERT INTO events(job_id, ts, finding_id, stage, status, title, detail) VALUES (?,?,?,?,?,?,?)",
                (self.job_id, db.now_ms(), finding_id, stage, status, title, db.dumps(detail or {})),
            )


log = logging.getLogger(__name__)
INTERRUPTED = "Interrupted by a server restart"


def start(target, *args) -> None:
    threading.Thread(target=target, args=args, daemon=True).start()


def fail_interrupted() -> None:
    """Jobs are threads of this process, so whatever was mid-flight when it last stopped is gone."""
    with db.write() as conn:
        conn.execute("UPDATE processes SET status = 'failed', error = ?, finished_at = ? WHERE status = 'running'", (INTERRUPTED, db.now()))
        conn.execute("UPDATE rules_versions SET status = 'failed', error = ? WHERE status = 'extracting'", (INTERRUPTED,))


def start_extraction(workspace_id: str) -> str:
    with db.write() as conn:
        doc = domain_document(conn, workspace_id)
        equipments = equipments_of(conn, workspace_id)
        if doc is None:
            raise ValueError("add the domain knowledge document before extracting rules")
        if not equipments:
            raise ValueError("add at least one asset before extracting rules; the rules close over the equipment types")
        rid = db.new_id()
        conn.execute(
            "INSERT INTO rules_versions(id, workspace_id, version, status, origin, yaml, meta, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (rid, workspace_id, next_version(conn, workspace_id), "extracting", "extracted", None,
             db.dumps({"model": settings.extract_model}), db.now()),
        )
        touch(conn, workspace_id)
    emit = Recorder(rid)
    text = doc["content"]
    emit("intake", "done", f"Read {doc['filename']} and {len(equipments)} assets", {
        "filename": doc["filename"], "chars": len(text), "lines": len(text.splitlines()),
        "sections": HEADING.findall(text), "assets": len(equipments),
        "equipment_types": sorted({e.equipment_type for e in equipments}),
        "redundancy_values": sorted({e.redundancy for e in equipments}),
        "model": settings.extract_model, "fake_model": settings.fake_model,
    })
    start(_extract, rid, text, equipments, emit)
    return rid


def _extract(rules_version_id: str, domain_text: str, equipments: list[Equipment], emit: Recorder) -> None:
    started = time.perf_counter()
    try:
        extraction = extract_rules(model(), settings.extract_model, domain_text, equipments, emit)
        meta = {
            "model": settings.extract_model,
            "usage": extraction.usage,
            "attempts": [asdict(a) | {"raw": ""} for a in extraction.attempts],
            "issues": [asdict(i) for i in extraction.issues],
            "ms": int((time.perf_counter() - started) * 1000),
        }
        with db.write() as conn:
            row = db.one(conn, "SELECT version FROM rules_versions WHERE id = ?", (rules_version_id,))
            version = row["version"] if row else 0
        emit("draft", "done", f"Draft v{version} saved, waiting for approval", {
            "version": version, "issues": len(extraction.issues), "usage": extraction.usage, "ms": meta["ms"],
            "attempts": len(extraction.attempts),
        })
        with db.write() as conn:
            conn.execute("UPDATE rules_versions SET status = 'draft', yaml = ?, meta = ? WHERE id = ?",
                         (to_yaml(extraction.rules), db.dumps(meta), rules_version_id))
    except Exception as error:
        log.exception("extraction %s failed", rules_version_id)
        emit("draft", "fail", f"Extraction failed: {type(error).__name__}", {"error": str(error)})
        with db.write() as conn:
            conn.execute("UPDATE rules_versions SET status = 'failed', error = ? WHERE id = ?",
                         (f"{type(error).__name__}: {error}", rules_version_id))


def start_process(workspace_id: str, rules_version_id: str, rules: Rules, checked: FindingsCheck) -> str:
    with db.write() as conn:
        equipments = equipments_of(conn, workspace_id)
        registry, by_equipment, cases = build_cases(equipments, checked.findings)
        annotate_batch(cases, registry, by_equipment, rules)
        version = db.one(conn, "SELECT version FROM rules_versions WHERE id = ?", (rules_version_id,))
        pid = db.new_id()
        number = next_process_number(conn, workspace_id)
        conn.execute(
            "INSERT INTO processes(id, workspace_id, rules_version_id, number, status, model, progress, input, started_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (pid, workspace_id, rules_version_id, number, "running", settings.assess_model,
             db.dumps({c.finding.finding_id: "queued" for c in cases}),
             db.dumps({
                 "filename": checked.filename,
                 "findings": [c.finding.to_record() for c in cases],
                 "equipment": {
                     eid: {"equipment_type": registry[eid].equipment_type,
                           "safety_critical_element": registry[eid].safety_critical_element,
                           "criticality_score": registry[eid].criticality_score,
                           "reliability_score": registry[eid].reliability_score}
                     for eid in by_equipment
                 },
                 "assets": len(equipments),
                 "type_mismatches": checked.type_mismatches,
                 "rules_version": version["version"] if version else None,
                 "workers": settings.workers,
                 "fake_model": settings.fake_model,
             }),
             db.now()),
        )
        touch(conn, workspace_id)
    emit = Recorder(pid)
    emit("intake", "done", f"{len(cases)} findings joined to {len(equipments)} assets", {
        "filename": checked.filename, "findings": len(cases), "assets": len(equipments),
        "type_mismatches": checked.type_mismatches, "rules_version": version["version"] if version else None,
        "equipment_with_findings": len(by_equipment),
    })
    for case in cases:
        eq = case.equipment
        emit("intake", "done", f"Joined to {eq.equipment_id}, {eq.equipment_type}", {
            "equipment_id": eq.equipment_id, "equipment_type": eq.equipment_type,
            "safety_critical_element": eq.safety_critical_element, "criticality_score": eq.criticality_score,
            "reliability_score": eq.reliability_score, "redundancy": eq.redundancy,
            "reported_date": case.finding.reported_date.isoformat(), "reporter_role": case.finding.reporter_role,
        }, case.finding.finding_id)
        kinds = [n.kind.value for n in case.notes]
        emit("notes", "done",
             f"{len(case.notes)} batch {'note' if len(case.notes) == 1 else 'notes'}" if case.notes else "No batch notes, nothing the finding alone would hide",
             {"notes": [{"kind": n.kind.value, "text": n.text} for n in case.notes], "kinds": kinds}, case.finding.finding_id)
    emit("start", "done", f"Assessing with {settings.assess_model} on {settings.workers} workers", {
        "model": settings.assess_model, "workers": settings.workers, "fake_model": settings.fake_model,
        "cache": not settings.fake_model, "findings": len(cases),
    })
    start(_process, pid, cases, rules, emit)
    return pid


def _set_progress(process_id: str, finding_id: str, status: str) -> None:
    with db.write() as conn:
        row = db.one(conn, "SELECT progress FROM processes WHERE id = ?", (process_id,))
        progress = db.loads(row["progress"], {}) if row else {}
        progress[finding_id] = status
        conn.execute("UPDATE processes SET progress = ? WHERE id = ?", (db.dumps(progress), process_id))


def _process(process_id: str, cases: list[Case], rules: Rules, emit: Recorder) -> None:
    started = time.perf_counter()
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}
    failed = 0

    def on_start(case: Case):
        _set_progress(process_id, case.finding.finding_id, "running")

    def on_done(result: Result):
        nonlocal failed
        failed += int(result.failed)
        with db.write() as conn:
            conn.execute(
                "INSERT INTO tickets(id, process_id, position, finding_id, equipment_id, ticket, trace) VALUES (?,?,?,?,?,?,?)",
                (db.new_id(), process_id, result.position, result.ticket.finding_id, result.ticket.equipment_id,
                 result.ticket.model_dump_json(), db.dumps(result.trace)),
            )
        _set_progress(process_id, result.case.finding.finding_id, "failed" if result.failed else "done")

    try:
        results = run_triage(cases, rules, model(), settings.assess_model, settings.workers, on_start, on_done, emit)
        with db.connect() as conn:
            rows = db.all_rows(conn, "SELECT detail FROM events WHERE job_id = ? AND stage = 'model' AND status = 'done'", (process_id,))
        for row in rows:
            for k in usage:
                usage[k] += (db.loads(row["detail"], {}).get("usage") or {}).get(k, 0)
        bands: dict[str, int] = {}
        review = 0
        for r in results:
            u = r.trace.get("urgency") or {}
            if u.get("band"):
                bands[u["band"]] = bands.get(u["band"], 0) + 1
            review += int(r.ticket.review_required)
        ms = int((time.perf_counter() - started) * 1000)
        emit("finish", "done", f"{len(results)} tickets drafted in {ms / 1000:.1f} s" + (f", {failed} failed" if failed else ""), {
            "tickets": len(results), "failed": failed, "review_required": review, "bands": bands, "usage": usage, "ms": ms,
        })
        with db.write() as conn:
            conn.execute("UPDATE processes SET status = 'done', finished_at = ? WHERE id = ?", (db.now(), process_id))
    except Exception as error:
        log.exception("process %s failed", process_id)
        emit("finish", "fail", f"Process failed: {type(error).__name__}", {"error": str(error)})
        with db.write() as conn:
            conn.execute("UPDATE processes SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
                         (f"{type(error).__name__}: {error}", db.now(), process_id))
