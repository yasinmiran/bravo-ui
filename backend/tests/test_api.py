import time

import pytest
from fastapi.testclient import TestClient

from app import db
from app.api import jobs
from app.config import SEED_DIR, settings
from app.main import app
from tests.conftest import PASSPHRASE

FINDINGS = (SEED_DIR / "bravo" / "inspection_findings.csv").read_bytes()


def client() -> TestClient:
    return TestClient(app, headers=PASSPHRASE)


def wait(c, url, done):
    for _ in range(600):
        d = c.get(url).json()
        if d["status"] in done:
            return d
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting on {url}")


def approved_bravo(c) -> tuple[str, str]:
    ws = c.post("/api/workspaces/bravo-example").json()
    wid = ws["id"]
    rid = c.post(f"/api/workspaces/{wid}/rules/extract").json()["id"]
    rules = wait(c, f"/api/rules/{rid}", ("draft", "failed"))
    assert rules["status"] == "draft", rules["error"]
    assert c.post(f"/api/rules/{rid}/approve").json()["status"] == "approved"
    return wid, rid


def test_passphrase_gate():
    with TestClient(app) as c:
        assert c.get("/api/workspaces").status_code == 401
        assert c.get("/api/health").status_code == 200
        assert c.post("/api/auth/login", json={"passphrase": "nope"}).status_code == 401
        assert c.post("/api/auth/login", json={"passphrase": settings.passphrase}).status_code == 204
        assert c.get("/api/workspaces", headers=PASSPHRASE).status_code == 200


def test_full_flow_with_fake_model():
    with client() as c:
        ws = c.post("/api/workspaces/bravo-example").json()
        wid = ws["id"]
        assert ws["document"]["sections"] > 0 and ws["assets"]["count"] == 18
        assert c.post(f"/api/workspaces/{wid}/processes", files={"file": ("f.csv", FINDINGS, "text/csv")},
                      data={"rules_version_id": "missing"}).status_code == 404
        rid = c.post(f"/api/workspaces/{wid}/rules/extract").json()["id"]
        rules = wait(c, f"/api/rules/{rid}", ("draft", "failed"))
        assert rules["status"] == "draft", rules["error"]
        extraction_events = c.get(f"/api/jobs/{rid}/events").json()
        assert extraction_events["finished"]
        assert [e["stage"] for e in extraction_events["events"]] == ["intake", "schema", "model", "model", "validate", "coverage", "draft"]
        assert c.post(f"/api/workspaces/{wid}/processes", files={"file": ("f.csv", FINDINGS, "text/csv")},
                      data={"rules_version_id": rid}).status_code == 409
        assert c.post(f"/api/rules/{rid}/approve").json()["status"] == "approved"
        preview = c.post(f"/api/workspaces/{wid}/processes/preview", files={"file": ("f.csv", FINDINGS, "text/csv")}).json()
        assert preview["ok"] and preview["rows"] == 21 and len(preview["findings"]) == 21
        submitted = c.post(f"/api/workspaces/{wid}/processes", files={"file": ("inspection_findings.csv", FINDINGS, "text/csv")},
                           data={"rules_version_id": rid})
        assert submitted.status_code == 202, submitted.text
        pid = submitted.json()["id"]
        assert submitted.json()["number"] == 1 and submitted.json()["filename"] == "inspection_findings.csv"
        process = wait(c, f"/api/processes/{pid}", ("done", "failed"))
        assert process["status"] == "done", process["error"]
        assert len(process["tickets"]) == 21 and len(process["input"]["findings"]) == 21
        by_finding = {t["ticket"]["finding_id"]: t for t in process["tickets"]}
        assert by_finding["F-1005"]["overrides"] == ["protection_layer_impaired_no_deviation"]
        assert by_finding["F-1012"]["overrides"] == ["evacuation_below_pob"]
        assert by_finding["F-1014"]["attempts"] == 2

        events = c.get(f"/api/jobs/{pid}/events").json()
        assert events["finished"]
        stages = [e["stage"] for e in events["events"]]
        assert stages[0] == "intake" and stages[-1] == "finish"
        assert stages.count("notes") == 21 and stages.count("ticket") == 21 and stages.count("intake") == 22
        f14 = [e for e in events["events"] if e["finding_id"] == "F-1014"]
        assert [e["stage"] for e in f14] == ["intake", "notes", "finding", "prompt", "model", "model", "validate", "invariants",
                                              "model", "model", "validate", "invariants", "urgency", "review", "ticket"]
        failed_check = next(e for e in f14 if e["stage"] == "invariants" and e["status"] == "fail")
        assert failed_check["detail"]["retry"] and any(not ch["passed"] for ch in failed_check["detail"]["checks"])
        assert all(ch["passed"] for ch in [e for e in f14 if e["stage"] == "invariants"][-1]["detail"]["checks"])
        later = c.get(f"/api/jobs/{pid}/events?after={events['events'][-2]['id']}").json()
        assert [e["stage"] for e in later["events"]] == ["finish"]

        with c.stream("GET", f"/api/jobs/{pid}/events/stream", params={"key": settings.passphrase}, headers={"X-Passphrase": ""}) as s:
            assert s.status_code == 200
            body = "".join(s.iter_text())
        assert body.count("event: stage") == len(events["events"]) and body.rstrip().endswith("event: end\ndata: {}")

        export = c.get(f"/api/processes/{pid}/export").json()
        assert export["tickets_generated"] == 21 and set(export) == {"generated_at", "tickets_generated", "tickets"}
        tid = process["tickets"][0]["id"]
        assert c.post(f"/api/tickets/{tid}/decision", json={"decision": "approved", "note": "fine"}).json()["decision"] == "approved"
        assert c.get(f"/api/processes/{pid}/export?only=approved").json()["tickets_generated"] == 1
        detail = c.get(f"/api/workspaces/{wid}").json()
        assert detail["approved"]["coverage"]["ok"] and detail["processes"][0]["findings_count"] == 21
        listing = c.get("/api/workspaces").json()
        assert listing[0]["tickets"] == 21 and listing[0]["pending_tickets"] == 20


def test_assets_are_editable_and_coverage_goes_stale():
    with client() as c:
        wid, rid = approved_bravo(c)
        assets = c.get(f"/api/workspaces/{wid}/assets").json()
        assert assets["summary"]["count"] == 18 and len(assets["summary"]["equipment_types"]) == 13
        edited = c.patch(f"/api/workspaces/{wid}/assets/K-3401", json={"engineer_comment": "Bearing replaced in June."}).json()
        assert next(a for a in edited["assets"] if a["equipment_id"] == "K-3401")["engineer_comment"] == "Bearing replaced in June."
        assert c.patch(f"/api/workspaces/{wid}/assets/K-3401", json={"criticality_score": 11}).status_code == 422
        assert c.get(f"/api/workspaces/{wid}").json()["approved"]["coverage"]["ok"]
        added = c.post(f"/api/workspaces/{wid}/assets", json={
            "equipment_id": "CR-9001", "equipment_type": "Crane", "service_description": "Pedestal crane",
            "criticality_score": 6, "reliability_score": 7, "safety_critical_element": False, "redundancy": "None",
        })
        assert added.status_code == 201 and added.json()["summary"]["count"] == 19
        assert c.post(f"/api/workspaces/{wid}/assets", json={
            "equipment_id": "CR-9001", "equipment_type": "Crane", "criticality_score": 6, "reliability_score": 7,
            "safety_critical_element": False}).status_code == 409
        coverage = c.get(f"/api/workspaces/{wid}").json()["approved"]["coverage"]
        assert not coverage["ok"] and "Crane" in coverage["errors"][0]
        blocked = c.post(f"/api/workspaces/{wid}/processes", files={"file": ("f.csv", FINDINGS, "text/csv")}, data={"rules_version_id": rid})
        assert blocked.status_code == 409
        assert c.delete(f"/api/workspaces/{wid}/assets/CR-9001").json()["summary"]["count"] == 18
        assert c.get(f"/api/workspaces/{wid}").json()["approved"]["coverage"]["ok"]


def test_findings_validation_blocks_submit():
    with client() as c:
        wid, rid = approved_bravo(c)
        bad = b"finding_id,reported_date,equipment_id,equipment_type,inspection_type,inspection_method,finding_description,reported_by,reporter_role\nF-9,2026-06-01,XV-9001,Valve,Routine,Visual,Leak.,A,Operator\n"
        preview = c.post(f"/api/workspaces/{wid}/processes/preview", files={"file": ("f.csv", bad, "text/csv")}).json()
        assert not preview["ok"] and preview["unknown_equipment"] == [{"finding_id": "F-9", "equipment_id": "XV-9001"}]
        rejected = c.post(f"/api/workspaces/{wid}/processes", files={"file": ("f.csv", bad, "text/csv")}, data={"rules_version_id": rid})
        assert rejected.status_code == 422 and rejected.json()["detail"]["unknown_equipment"]


def test_import_validation_and_extract_preconditions():
    with client() as c:
        wid = c.post("/api/workspaces", json={"name": "Charlie"}).json()["id"]
        assert c.post(f"/api/workspaces/{wid}/rules/extract").status_code == 409
        bad = c.put(f"/api/workspaces/{wid}/assets/import", files={"file": ("r.csv", b"equipment_id,nope\nA,1\n", "text/csv")})
        assert bad.status_code == 422 and "missing column" in bad.json()["detail"]["problems"][0]
        good = c.put(f"/api/workspaces/{wid}/assets/import",
                     files={"file": ("r.csv", (SEED_DIR / "bravo" / "equipment_registry.csv").read_bytes(), "text/csv")})
        assert good.status_code == 200 and good.json()["summary"]["count"] == 18
        assert c.post(f"/api/workspaces/{wid}/rules/extract").status_code == 409
        doc = c.put(f"/api/workspaces/{wid}/document", files={"file": ("notes.md", b"# Notes\n\nSome notes.\n", "text/markdown")})
        assert doc.status_code == 200 and doc.json()["document"]["sections"] == 1
        started = c.post(f"/api/workspaces/{wid}/rules/extract")
        assert started.status_code == 202
        wait(c, f"/api/rules/{started.json()['id']}", ("draft", "failed"))


def test_restart_marks_interrupted_jobs_failed():
    with client() as c:
        _, rid = approved_bravo(c)
        with db.write() as conn:
            conn.execute("UPDATE rules_versions SET status = 'extracting' WHERE id = ?", (rid,))
        jobs.fail_interrupted()
        failed = c.get(f"/api/rules/{rid}").json()
        assert failed["status"] == "failed" and failed["error"] == jobs.INTERRUPTED


def test_rejecting_needs_a_note_and_api_paths_never_fall_back_to_the_spa():
    with client() as c:
        assert c.post("/api/tickets/nope/decision", json={"decision": "rejected"}).status_code == 422
        assert c.post("/api/tickets/nope/decision", json={"decision": "rejected", "note": "   "}).status_code == 422
        assert c.post("/api/tickets/nope/decision", json={"decision": "rejected", "note": "wrong asset"}).status_code == 404
        assert c.get("/api/nope").status_code == 404


def test_live_model_without_a_key_fails_plainly(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(jobs, "_model", None)
    object.__setattr__(settings, "fake_model", False)
    try:
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
            jobs.model()
    finally:
        object.__setattr__(settings, "fake_model", True)
        jobs._model = None


def test_bad_yaml_is_422():
    with client() as c:
        wid = c.post("/api/workspaces", json={"name": "Delta"}).json()["id"]
        assert c.post(f"/api/workspaces/{wid}/rules", json={"yaml": "version: 1\n"}).status_code == 422
