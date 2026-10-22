"""Step 6: the fixed set of reasons a ticket must pass a human before the work queue."""

from app.models.assessment import Assessment, Verdict
from app.models.inputs import Case, NoteKind
from app.models.rules import Rules
from app.pipeline.urgency import UrgencyTrace


def review(a: Assessment, case: Case, verdict: Verdict, urgency: UrgencyTrace, rules: Rules) -> list[str]:
    reasons = []
    today_low, _ = rules.band_range("today")
    if urgency.score >= today_low:
        reasons.append("Urgency is in the today band.")
    if case.equipment.safety_critical_element:
        reasons.append("Safety Critical Element: every ticket is checked by a human before it enters the work queue.")
    if urgency.overrides:
        reasons.append("An escalation override set the urgency.")
    if verdict.violations:
        reasons.append("Scores contradicted the model's own flags after a retry: " + "; ".join(verdict.violations) + ".")
    if a.uncertainty == "high":
        reasons.append("The model rated its uncertainty high.")
    kinds = {n.kind for n in case.notes}
    if NoteKind.PARTNER_HAS_FINDING in kinds:
        reasons.append("The redundant partner also has an open finding; redundancy credit withdrawn.")
    if NoteKind.PARTNER_UNVERIFIED in kinds:
        reasons.append("The redundant partner cannot be verified.")
    if NoteKind.REDUNDANCY_UNCLASSIFIED in kinds:
        reasons.append("The registry redundancy value is not in the rules vocabulary; redundancy neither credited nor verified.")
    return reasons
