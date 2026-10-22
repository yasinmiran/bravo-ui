from app.models.inputs import NoteKind
from app.models.inputs import parse_registry
from app.pipeline.cases import build_cases, check_findings
from app.pipeline.notes import annotate_batch, voted_text
from app.models.rules import RedundancyEntry
from tests.helpers import BRAVO, bravo_equipments, bravo_findings, bravo_rules


def bravo_cases():
    registry, by_eq, cases = build_cases(bravo_equipments(), bravo_findings())
    annotate_batch(cases, registry, by_eq, bravo_rules())
    return {c.finding.finding_id: c for c in cases}


def kinds(case):
    return [n.kind for n in case.notes]


def test_both_firewater_pumps_lose_redundancy_credit():
    cases = bravo_cases()
    assert NoteKind.PARTNER_HAS_FINDING in kinds(cases["F-1003"])
    assert NoteKind.PARTNER_HAS_FINDING in kinds(cases["F-1017"])


def test_both_transmitters_lose_redundancy_credit():
    cases = bravo_cases()
    assert NoteKind.PARTNER_HAS_FINDING in kinds(cases["F-1013"])
    assert NoteKind.PARTNER_HAS_FINDING in kinds(cases["F-1018"])


def test_lifeboat_partner_not_in_registry_is_unverified():
    assert NoteKind.PARTNER_UNVERIFIED in kinds(bravo_cases()["F-1012"])


def test_voted_group_note():
    assert NoteKind.VOTED_GROUP in kinds(bravo_cases()["F-1005"])
    text = voted_text("Voted 2oo3", RedundancyEntry(kind="voted", partner="", note=""))
    assert "2oo2" in text and "next failure defeats it" in text


def test_sibling_notes_carry_two_sentences_only():
    crack = bravo_cases()["F-1008"]
    sibling = next(n for n in crack.notes if n.kind is NoteKind.SIBLING)
    assert "F-1009" in sibling.text
    assert sibling.text.count(".") <= 4


def test_unknown_equipment_reported_not_fatal():
    registry = (BRAVO / "equipment_registry.csv").read_text()
    findings = (BRAVO / "inspection_findings.csv").read_text().replace("K-3401", "K-9999")
    v = check_findings(parse_registry(registry).rows, findings, "f.csv")
    assert not v.ok
    assert {u["equipment_id"] for u in v.unknown_equipment} == {"K-9999"}


def test_missing_column_is_a_problem():
    parsed = parse_registry("equipment_id,equipment_type\nA,B\n")
    assert parsed.problems and "missing column" in parsed.problems[0]
    v = check_findings([], "finding_id\nF-1\n", "f.csv")
    assert not v.ok and "missing column" in v.problems[0]
