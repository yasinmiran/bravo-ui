"""Reads and writes that more than one router needs."""

from collections import Counter
from dataclasses import asdict

from fastapi import HTTPException

from app import db
from app.models.inputs import Equipment
from app.models.rules import Rules
from app.rules.validate import check
from app.rules.yaml_io import from_yaml

DOCUMENT_KIND = "domain"
ASSET_FIELDS = ("equipment_id", "equipment_type", "service_description", "criticality_score",
                "reliability_score", "safety_critical_element", "redundancy", "engineer_comment")


def get_workspace(conn, workspace_id: str) -> dict:
    ws = db.one(conn, "SELECT * FROM workspaces WHERE id = ?", (workspace_id,))
    if not ws:
        raise HTTPException(404, "workspace not found")
    return ws


def domain_document(conn, workspace_id: str) -> dict | None:
    return db.one(conn, "SELECT filename, content, uploaded_at FROM documents WHERE workspace_id = ? AND kind = ?",
                  (workspace_id, DOCUMENT_KIND))


def document_summary(doc: dict | None) -> dict | None:
    if not doc:
        return None
    lines = doc["content"].splitlines()
    return {
        "filename": doc["filename"], "uploaded_at": doc["uploaded_at"],
        "chars": len(doc["content"]), "lines": len(lines),
        "sections": sum(1 for line in lines if line.startswith("#")),
    }


def asset_rows(conn, workspace_id: str) -> list[dict]:
    rows = db.all_rows(conn, "SELECT * FROM assets WHERE workspace_id = ? ORDER BY position, equipment_id", (workspace_id,))
    for r in rows:
        r["safety_critical_element"] = bool(r["safety_critical_element"])
        r.pop("workspace_id", None)
    return rows


def equipments_of(conn, workspace_id: str) -> list[Equipment]:
    return [Equipment.from_record(r) for r in asset_rows(conn, workspace_id)]


def asset_summary(rows: list[dict]) -> dict:
    types = Counter(r["equipment_type"] for r in rows)
    values = Counter(r["redundancy"] for r in rows)
    return {
        "count": len(rows),
        "safety_critical": sum(1 for r in rows if r["safety_critical_element"]),
        "equipment_types": [{"name": k, "count": v} for k, v in sorted(types.items())],
        "redundancy_values": [{"value": k, "count": v} for k, v in sorted(values.items())],
        "updated_at": max((r["updated_at"] for r in rows), default=None),
    }


def workspace_detail(conn, workspace_id: str) -> dict:
    ws = get_workspace(conn, workspace_id)
    rows = asset_rows(conn, workspace_id)
    versions = db.all_rows(
        conn, "SELECT id, version, status, origin, error, created_at, meta FROM rules_versions WHERE workspace_id = ? ORDER BY version DESC",
        (workspace_id,))
    processes = db.all_rows(
        conn, "SELECT * FROM processes WHERE workspace_id = ? ORDER BY started_at DESC, number DESC", (workspace_id,))
    approved = next((v for v in versions if v["status"] == "approved"), None)
    approved_detail = None
    if approved:
        full = rules_row(conn, approved["id"])
        rules, issues, parse_error = rules_with_issues(conn, full)
        approved_detail = {"id": full["id"], "version": full["version"], "coverage": coverage_of(issues, parse_error)}
    return {
        **ws,
        "document": document_summary(domain_document(conn, workspace_id)),
        "assets": asset_summary(rows),
        "rules_versions": [v | {"meta": db.loads(v["meta"], {})} for v in versions],
        "approved": approved_detail,
        "processes": [process_summary(p) for p in processes],
    }


def coverage_of(issues: list[dict], parse_error: str | None) -> dict:
    errors = [i["message"] for i in issues if i["level"] == "error"]
    if parse_error:
        errors = [parse_error] + errors
    return {"ok": not errors, "errors": errors, "warnings": [i["message"] for i in issues if i["level"] == "warning"]}


def process_summary(r: dict) -> dict:
    progress = db.loads(r.get("progress"), {})
    counts = {"queued": 0, "running": 0, "done": 0, "failed": 0}
    for s in progress.values():
        counts[s] = counts.get(s, 0) + 1
    inp = db.loads(r.get("input"), {})
    return {k: v for k, v in r.items() if k not in ("progress", "input")} | {
        "counts": counts, "total": len(progress),
        "filename": inp.get("filename"), "findings_count": len(inp.get("findings", [])),
        "rules_version": inp.get("rules_version"),
    }


def rules_row(conn, rules_version_id: str) -> dict:
    row = db.one(conn, "SELECT * FROM rules_versions WHERE id = ?", (rules_version_id,))
    if not row:
        raise HTTPException(404, "rules version not found")
    return row


def rules_with_issues(conn, row: dict) -> tuple[Rules | None, list[dict], str | None]:
    if not row["yaml"]:
        return None, [], None
    try:
        rules = from_yaml(row["yaml"])
    except ValueError as error:
        return None, [], str(error)
    return rules, [asdict(i) for i in check(rules, equipments_of(conn, row["workspace_id"]))], None


def next_version(conn, workspace_id: str) -> int:
    row = db.one(conn, "SELECT COALESCE(MAX(version), 0) AS v FROM rules_versions WHERE workspace_id = ?", (workspace_id,))
    return int(row["v"]) + 1


def next_process_number(conn, workspace_id: str) -> int:
    row = db.one(conn, "SELECT COALESCE(MAX(number), 0) AS n FROM processes WHERE workspace_id = ?", (workspace_id,))
    return int(row["n"]) + 1


def touch(conn, workspace_id: str) -> None:
    conn.execute("UPDATE workspaces SET updated_at = ? WHERE id = ?", (db.now(), workspace_id))
