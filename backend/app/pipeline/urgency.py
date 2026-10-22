"""Step 5: urgency is derived in code from likelihood and impact, then overrides lift it."""

from dataclasses import dataclass, field

from app.models.assessment import Assessment
from app.models.inputs import Case
from app.models.rules import Rules


@dataclass
class Gate:
    id: str
    name: str
    condition: str
    applied: bool
    value: float


@dataclass
class FiredOverride:
    id: str
    evidence: str
    reason: str
    floor: int


@dataclass
class UrgencyTrace:
    base: float
    steps: list[str]
    gates: list[Gate]
    derived: int
    overrides: list[FiredOverride] = field(default_factory=list)
    score: int = 0
    band: str = ""

    def rationale(self) -> str:
        parts = list(self.steps)
        for o in self.overrides:
            parts.append(f"override {o.id} ({o.evidence}): {o.reason}; urgency at least {o.floor}")
        return "; ".join(parts) + f". Band: {self.band.replace('_', ' ')}."


def derive(a: Assessment, case: Case, rules: Rules) -> UrgencyTrace:
    u = rules.urgency
    L, I = a.likelihood_of_failure.score, a.impact_of_failure.score
    base = u.weights.impact * I + u.weights.likelihood * L
    steps = [f"derived {base:.1f} from impact {I} and likelihood {L}, impact weighted"]
    gates: list[Gate] = []
    value = base

    lift = L >= u.near_certain.likelihood_at_least and value < I
    if lift:
        value = I
        steps.append(f"near-certain failure, held at impact {I}")
    gates.append(Gate("near_certain", "Near-certain failure",
                      f"likelihood at least {u.near_certain.likelihood_at_least} lifts the base to at least the impact score", lift, value))

    cap = I <= u.inconsequential.impact_at_most and value > u.inconsequential.urgency_at_most
    if cap:
        value = u.inconsequential.urgency_at_most
        steps.append("inconsequential item, capped at next planned shutdown")
    gates.append(Gate("inconsequential", "Inconsequential item",
                      f"impact at most {u.inconsequential.impact_at_most} caps urgency at {u.inconsequential.urgency_at_most}", cap, value))

    score = int(value + 0.5)
    gates.append(Gate("rounding", "Rounded", "half rounds up", True, score))

    floor = case.equipment.safety_critical_element and I >= u.sce_floor.impact_at_least and score < u.sce_floor.urgency_at_least
    if floor:
        score = u.sce_floor.urgency_at_least
        steps.append("safety critical element with high impact, this week at the latest")
    gates.append(Gate("sce_floor", "Safety critical element floor",
                      f"a safety critical element with impact at least {u.sce_floor.impact_at_least} gets at least {u.sce_floor.urgency_at_least}", floor, score))

    trace = UrgencyTrace(base=round(base, 2), steps=steps, gates=gates, derived=score, score=score)
    apply_overrides(trace, a, case, rules)
    trace.band = rules.band_of(trace.score)
    return trace


def apply_overrides(trace: UrgencyTrace, a: Assessment, case: Case, rules: Rules) -> None:
    eq_type = case.equipment.equipment_type
    for o in rules.overrides:
        if o.id == "protection_layer_impaired_no_deviation":
            hit = a.protection_layer_impaired and a.deviation_recorded != "yes" and eq_type in rules.protection_layer_types
            evidence = (f"model flagged protection_layer_impaired with deviation_recorded={a.deviation_recorded}"
                        f"{' (unknown is treated as not recorded)' if a.deviation_recorded == 'unknown' else ''}, "
                        f"and {eq_type} is a protection layer type")
        elif o.id == "evacuation_below_pob":
            hit = a.evacuation_capacity_reduced and eq_type in rules.evacuation_types
            evidence = (f"model flagged evacuation_capacity_reduced and {eq_type} is an evacuation type; "
                        f"POB is not in the data, so the comparison is unconfirmed and left to review")
        else:
            raise ValueError(f"unknown override {o.id!r} in rules")
        if hit:
            trace.overrides.append(FiredOverride(o.id, evidence, o.reason, o.floor))
            trace.score = max(trace.score, o.floor)
