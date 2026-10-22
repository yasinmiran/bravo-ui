from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app import db
from app.api import jobs
from app.api.store import coverage_of, get_workspace, next_version, rules_row, rules_with_issues, touch
from app.rules.yaml_io import from_yaml

router = APIRouter(prefix="/api", tags=["rules"])


class RulesEdit(BaseModel):
    yaml: str


def rules_detail(conn, row: dict) -> dict:
    rules, issues, parse_error = rules_with_issues(conn, row)
    return {
        **{k: v for k, v in row.items() if k != "meta"},
        "meta": db.loads(row["meta"], {}),
        "rules": rules.model_dump() if rules else None,
        "issues": issues,
        "parse_error": parse_error,
        "coverage": coverage_of(issues, parse_error),
        "approvable": rules is not None and not any(i["level"] == "error" for i in issues),
    }


@router.post("/workspaces/{workspace_id}/rules/extract", status_code=202)
def extract(workspace_id: str):
    with db.connect() as conn:
        get_workspace(conn, workspace_id)
    try:
        rid = jobs.start_extraction(workspace_id)
    except ValueError as error:
        raise HTTPException(409, str(error))
    with db.connect() as conn:
        return rules_detail(conn, rules_row(conn, rid))


@router.post("/workspaces/{workspace_id}/rules", status_code=201)
def create_from_yaml(workspace_id: str, body: RulesEdit):
    try:
        from_yaml(body.yaml)
    except ValueError as error:
        raise HTTPException(422, str(error))
    with db.write() as conn:
        get_workspace(conn, workspace_id)
        rid = db.new_id()
        conn.execute(
            "INSERT INTO rules_versions(id, workspace_id, version, status, origin, yaml, meta, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (rid, workspace_id, next_version(conn, workspace_id), "draft", "edited", body.yaml, "{}", db.now()),
        )
        touch(conn, workspace_id)
        return rules_detail(conn, rules_row(conn, rid))


@router.get("/rules/{rules_version_id}")
def read_rules(rules_version_id: str):
    with db.connect() as conn:
        return rules_detail(conn, rules_row(conn, rules_version_id))


@router.get("/rules/{rules_version_id}/yaml", response_class=PlainTextResponse)
def read_rules_yaml(rules_version_id: str):
    with db.connect() as conn:
        row = rules_row(conn, rules_version_id)
        if not row["yaml"]:
            raise HTTPException(409, "this version has no rules yet")
        return row["yaml"]


@router.put("/rules/{rules_version_id}")
def edit_rules(rules_version_id: str, body: RulesEdit):
    """Saves the edit as a new draft version in the same workspace; versions are immutable."""
    try:
        from_yaml(body.yaml)
    except ValueError as error:
        raise HTTPException(422, str(error))
    with db.write() as conn:
        row = rules_row(conn, rules_version_id)
        rid = db.new_id()
        conn.execute(
            "INSERT INTO rules_versions(id, workspace_id, version, status, origin, yaml, meta, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (rid, row["workspace_id"], next_version(conn, row["workspace_id"]), "draft", "edited", body.yaml,
             db.dumps({"edited_from": rules_version_id}), db.now()),
        )
        touch(conn, row["workspace_id"])
        return rules_detail(conn, rules_row(conn, rid))


@router.post("/rules/{rules_version_id}/approve")
def approve_rules(rules_version_id: str):
    with db.write() as conn:
        row = rules_row(conn, rules_version_id)
        if row["status"] not in ("draft", "approved"):
            raise HTTPException(409, f"a version in status {row['status']} cannot be approved")
        rules, issues, parse_error = rules_with_issues(conn, row)
        if rules is None:
            raise HTTPException(422, parse_error or "no rules to approve")
        errors = [i["message"] for i in issues if i["level"] == "error"]
        if errors:
            raise HTTPException(422, "coverage check failed: " + "; ".join(errors))
        conn.execute("UPDATE rules_versions SET status = 'approved' WHERE id = ?", (rules_version_id,))
        touch(conn, row["workspace_id"])
        return rules_detail(conn, rules_row(conn, rules_version_id))
