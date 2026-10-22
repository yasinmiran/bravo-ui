"""The equipment registry as rows the client owns, not a file they re-upload."""

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field, ValidationError

from app import db
from app.api.store import ASSET_FIELDS, asset_rows, asset_summary, get_workspace, touch
from app.api.uploads import read_upload
from app.models.inputs import parse_registry

router = APIRouter(prefix="/api/workspaces/{workspace_id}/assets", tags=["assets"])


class AssetIn(BaseModel):
    equipment_id: str = Field(min_length=1, max_length=40)
    equipment_type: str = Field(min_length=1, max_length=80)
    service_description: str = Field(default="", max_length=400)
    criticality_score: int = Field(ge=1, le=10)
    reliability_score: int = Field(ge=1, le=10)
    safety_critical_element: bool
    redundancy: str = Field(default="None", max_length=120)
    engineer_comment: str = Field(default="", max_length=4000)


class AssetPatch(BaseModel):
    equipment_type: str | None = Field(default=None, min_length=1, max_length=80)
    service_description: str | None = Field(default=None, max_length=400)
    criticality_score: int | None = Field(default=None, ge=1, le=10)
    reliability_score: int | None = Field(default=None, ge=1, le=10)
    safety_critical_element: bool | None = None
    redundancy: str | None = Field(default=None, max_length=120)
    engineer_comment: str | None = Field(default=None, max_length=4000)


def listing(conn, workspace_id: str) -> dict:
    rows = asset_rows(conn, workspace_id)
    return {"assets": rows, "summary": asset_summary(rows)}


def insert_asset(conn, workspace_id: str, a: AssetIn, position: int) -> None:
    conn.execute(
        "INSERT INTO assets(workspace_id, equipment_id, equipment_type, service_description, criticality_score, reliability_score,"
        " safety_critical_element, redundancy, engineer_comment, position, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (workspace_id, a.equipment_id.strip(), a.equipment_type.strip(), a.service_description.strip(), a.criticality_score,
         a.reliability_score, int(a.safety_critical_element), a.redundancy.strip() or "None", a.engineer_comment.strip(),
         position, db.now()),
    )


def replace_assets(conn, workspace_id: str, csv_text: str) -> None:
    parsed = parse_registry(csv_text)
    if parsed.problems:
        raise HTTPException(422, {"message": "the CSV has problems", "problems": parsed.problems})
    if not parsed.rows:
        raise HTTPException(422, {"message": "the CSV has no rows", "problems": []})
    rows, problems = [], []
    for e in parsed.rows:
        try:
            rows.append(AssetIn(**{f: getattr(e, f) for f in ASSET_FIELDS}))
        except ValidationError as error:
            first = error.errors()[0]
            problems.append(f"{e.equipment_id}: {first['loc'][0]} {first['msg'].lower()}")
    if problems:
        raise HTTPException(422, {"message": "the CSV has problems", "problems": problems})
    conn.execute("DELETE FROM assets WHERE workspace_id = ?", (workspace_id,))
    for position, asset in enumerate(rows, start=1):
        insert_asset(conn, workspace_id, asset, position)
    touch(conn, workspace_id)


@router.get("")
def list_assets(workspace_id: str):
    with db.connect() as conn:
        get_workspace(conn, workspace_id)
        return listing(conn, workspace_id)


@router.put("/import")
async def import_assets(workspace_id: str, file: UploadFile = File(...)):
    raw = await read_upload(file)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "file must be UTF-8 text")
    with db.write() as conn:
        get_workspace(conn, workspace_id)
        replace_assets(conn, workspace_id, text)
        return listing(conn, workspace_id)


@router.post("", status_code=201)
def add_asset(workspace_id: str, body: AssetIn):
    with db.write() as conn:
        get_workspace(conn, workspace_id)
        if db.one(conn, "SELECT 1 AS x FROM assets WHERE workspace_id = ? AND equipment_id = ?", (workspace_id, body.equipment_id.strip())):
            raise HTTPException(409, f"{body.equipment_id.strip()} is already in the assets")
        row = db.one(conn, "SELECT COALESCE(MAX(position), 0) AS p FROM assets WHERE workspace_id = ?", (workspace_id,))
        insert_asset(conn, workspace_id, body, int(row["p"]) + 1)
        touch(conn, workspace_id)
        return listing(conn, workspace_id)


@router.patch("/{equipment_id}")
def edit_asset(workspace_id: str, equipment_id: str, body: AssetPatch):
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(400, "nothing to change")
    if "safety_critical_element" in changes:
        changes["safety_critical_element"] = int(changes["safety_critical_element"])
    for key in ("equipment_type", "service_description", "redundancy", "engineer_comment"):
        if key in changes:
            changes[key] = changes[key].strip()
    if changes.get("redundancy") == "":
        changes["redundancy"] = "None"
    with db.write() as conn:
        get_workspace(conn, workspace_id)
        if not db.one(conn, "SELECT 1 AS x FROM assets WHERE workspace_id = ? AND equipment_id = ?", (workspace_id, equipment_id)):
            raise HTTPException(404, "asset not found")
        sets = ", ".join(f"{k} = ?" for k in changes)
        conn.execute(f"UPDATE assets SET {sets}, updated_at = ? WHERE workspace_id = ? AND equipment_id = ?",
                     (*changes.values(), db.now(), workspace_id, equipment_id))
        touch(conn, workspace_id)
        return listing(conn, workspace_id)


@router.delete("/{equipment_id}")
def delete_asset(workspace_id: str, equipment_id: str):
    with db.write() as conn:
        get_workspace(conn, workspace_id)
        gone = conn.execute("DELETE FROM assets WHERE workspace_id = ? AND equipment_id = ?", (workspace_id, equipment_id)).rowcount
        if not gone:
            raise HTTPException(404, "asset not found")
        touch(conn, workspace_id)
        return listing(conn, workspace_id)
