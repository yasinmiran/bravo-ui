from dataclasses import asdict
from datetime import date

from app.config import SEED_DIR
from app.models.assessment import Assessment, ScoredDimension
from app.models.inputs import Equipment, Finding, parse_findings, parse_registry
from app.models.rules import Rules
from app.rules.template import fake_rules

BRAVO = SEED_DIR / "bravo"


def bravo_equipments() -> list[Equipment]:
    return parse_registry((BRAVO / "equipment_registry.csv").read_text()).rows


def bravo_findings() -> list[Finding]:
    return parse_findings((BRAVO / "inspection_findings.csv").read_text()).rows


def bravo_rules() -> Rules:
    return Rules.model_validate(fake_rules([asdict(e) for e in bravo_equipments()], ""))


def equipment(**over) -> Equipment:
    base = dict(equipment_id="X-1", equipment_type="Widget", service_description="test", criticality_score=5,
                reliability_score=5, safety_critical_element=False, redundancy="None", engineer_comment="")
    return Equipment(**(base | over))


def finding(**over) -> Finding:
    base = dict(finding_id="F-0001", reported_date=date(2026, 6, 1), equipment_id="X-1", equipment_type="Widget",
                inspection_type="Routine", inspection_method="Visual", finding_description="Something.",
                reported_by="A", reporter_role="Operator")
    return Finding(**(base | over))


def assessment(L: int, I: int, **flags) -> Assessment:
    base = dict(
        summary="s", recommended_action="a",
        likelihood_of_failure=ScoredDimension(score=L, rationale="r"),
        impact_of_failure=ScoredDimension(score=I, rationale="r"),
        confirmed_failure=False, out_of_service=False, protection_layer_impaired=False,
        deviation_recorded="unknown", evacuation_capacity_reduced=False, uncertainty="low",
    )
    return Assessment(**(base | flags))
