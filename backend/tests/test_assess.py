from app.llm import FakeModel
from app.models.inputs import Case
from app.pipeline.assess import assess, invariant_violations
from app.pipeline.cases import build_cases
from app.pipeline.notes import annotate_batch
from app.pipeline.tickets import build_ticket, ticket_id
from tests.helpers import assessment, bravo_equipments, bravo_findings, bravo_rules, equipment, finding


def test_invariants():
    sce = Case(finding=finding(), equipment=equipment(safety_critical_element=True))
    assert invariant_violations(assessment(10, 10, confirmed_failure=True, out_of_service=True), sce)
    assert invariant_violations(assessment(5, 10, confirmed_failure=True), sce)
    assert invariant_violations(assessment(8, 2, out_of_service=True), sce)
    assert invariant_violations(assessment(10, 3, confirmed_failure=True), sce)
    assert invariant_violations(assessment(10, 3, confirmed_failure=True), Case(finding=finding(), equipment=equipment())) == []


def test_retry_paths_are_recorded_in_attempts():
    rules = bravo_rules()
    registry, by_eq, cases = build_cases(bravo_equipments(), bravo_findings())
    annotate_batch(cases, registry, by_eq, rules)
    by_id = {c.finding.finding_id: c for c in cases}
    v14 = assess(FakeModel(), "fake", by_id["F-1014"], rules)
    assert [a.outcome for a in v14.attempts] == ["invariant_violation", "accepted"]
    assert v14.assessment.likelihood_of_failure.score <= 4
    v03 = assess(FakeModel(), "fake", by_id["F-1003"], rules)
    assert [a.outcome for a in v03.attempts] == ["validation_error", "accepted"]
    assert len(v03.assessment.summary) <= 300


def test_ticket_ids():
    assert ticket_id("F-1005", 3) == "TKT-1005"
    assert ticket_id("weird id", 3) == "TKT-0003"


def test_failed_verdict_is_a_review_ticket():
    from app.models.assessment import Verdict
    case = Case(finding=finding(), equipment=equipment())
    ticket, trace = build_ticket(case, Verdict(None, ["model call failed: boom"]), bravo_rules(), 1, "fake")
    assert ticket.review_required and ticket.urgency.score == 10
    assert trace["urgency"] is None
