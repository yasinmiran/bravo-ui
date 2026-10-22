"""Step 7: the ticket, and the trace of how it was reached."""

import re
from dataclasses import asdict

from app.models.assessment import ScoredDimension, Verdict
from app.models.inputs import Case
from app.models.rules import Rules
from app.models.ticket import Ticket
from app.pipeline import urgency as urgency_step
from app.pipeline.events import Emitter, silent
from app.pipeline.prompts import RulesGap, system_prompt, user_prompt
from app.pipeline.review import review

FINDING_NUMBER = re.compile(r"^[A-Za-z]+-?(\d+)$")


def ticket_id(finding_id: str, position: int) -> str:
    m = FINDING_NUMBER.match(finding_id)
    return f"TKT-{m.group(1)}" if m else f"TKT-{position:04d}"


def prompt_or_gap(case: Case, rules: Rules) -> str:
    try:
        return user_prompt(case, rules)
    except RulesGap as gap:
        return f"(not sent: {gap})"


def build_ticket(case: Case, verdict: Verdict, rules: Rules, position: int, model_name: str,
                 emit: Emitter = silent) -> tuple[Ticket, dict]:
    f, eq = case.finding, case.equipment
    tid = ticket_id(f.finding_id, position)
    trace = {
        "finding": asdict(f) | {"reported_date": f.reported_date.isoformat()},
        "equipment": asdict(eq),
        "notes": [{"kind": n.kind.value, "text": n.text} for n in case.notes],
        "prompt": {"system": system_prompt(rules), "user": prompt_or_gap(case, rules)},
        "attempts": [asdict(a) for a in verdict.attempts],
        "model": model_name,
        "assessment": verdict.assessment.model_dump() if verdict.assessment else None,
        "violations": verdict.violations,
    }
    a = verdict.assessment
    if a is None:
        failed = ScoredDimension(score=10, rationale="Triage failed; human assessment required.")
        trace["urgency"] = None
        trace["review"] = {"required": True, "reasons": ["Automatic triage failed: " + "; ".join(verdict.violations) + "."]}
        emit("urgency", "fail", "No assessment to derive urgency from; scored 10 for a human", {"violations": verdict.violations}, f.finding_id)
        emit("review", "done", "Review required: automatic triage failed", {"reasons": trace["review"]["reasons"]}, f.finding_id)
        emit("ticket", "fail", f"{tid} drafted as a failed triage", {"ticket_id": tid, "review_required": True}, f.finding_id)
        return Ticket(
            ticket_id=tid, finding_id=f.finding_id, equipment_id=eq.equipment_id,
            summary=f"Finding {f.finding_id} on {eq.equipment_id} ({eq.equipment_type}) could not be triaged automatically; human assessment required.",
            likelihood_of_failure=failed, impact_of_failure=failed, urgency=failed,
            recommended_action="Assign to the duty integrity engineer for manual triage.",
            review_required=True, review_reason="Automatic triage failed: " + "; ".join(verdict.violations) + ".",
        ), trace
    u = urgency_step.derive(a, case, rules)
    reasons = review(a, case, verdict, u, rules)
    trace["urgency"] = {
        "base": u.base, "steps": u.steps, "gates": [asdict(g) for g in u.gates], "derived": u.derived,
        "score": u.score, "band": u.band, "overrides": [asdict(o) for o in u.overrides],
    }
    trace["review"] = {"required": bool(reasons), "reasons": reasons}
    emit("urgency", "done", f"Urgency {u.score}, {u.band.replace('_', ' ')}" + (f", {len(u.overrides)} override(s) fired" if u.overrides else ""),
         trace["urgency"] | {"likelihood": a.likelihood_of_failure.score, "impact": a.impact_of_failure.score}, f.finding_id)
    emit("review", "done", f"{len(reasons)} review trigger(s)" if reasons else "No review trigger, straight to the queue",
         {"reasons": reasons}, f.finding_id)
    emit("ticket", "done", f"{tid} drafted", {"ticket_id": tid, "review_required": bool(reasons), "band": u.band, "urgency": u.score}, f.finding_id)
    return Ticket(
        ticket_id=tid, finding_id=f.finding_id, equipment_id=eq.equipment_id,
        summary=a.summary,
        likelihood_of_failure=a.likelihood_of_failure,
        impact_of_failure=a.impact_of_failure,
        urgency=ScoredDimension(score=u.score, rationale=u.rationale()),
        recommended_action=a.recommended_action,
        review_required=bool(reasons), review_reason=" ".join(reasons) or None,
    ), trace
