import pytest

from app.models.inputs import Case
from app.pipeline.urgency import derive
from tests.helpers import assessment, bravo_rules, equipment, finding

RULES = bravo_rules()


def case(**eq):
    e = equipment(**eq)
    return Case(finding=finding(equipment_type=e.equipment_type), equipment=e)


@pytest.mark.parametrize("L,I,expected", [(10, 10, 10), (1, 1, 1), (10, 1, 4), (1, 10, 7), (8, 8, 8), (9, 6, 7)])
def test_corners_and_gates(L, I, expected):
    assert derive(assessment(L, I), case(), RULES).score == expected


def test_high_likelihood_low_impact_waits_for_shutdown():
    u = derive(assessment(10, 1), case(), RULES)
    assert u.band == "next_planned_shutdown" and u.score == 4


def test_inconsequential_cap_bites_when_weights_push_higher():
    heavy = RULES.model_copy(deep=True)
    heavy.urgency.weights.impact, heavy.urgency.weights.likelihood = 0.3, 0.7
    u = derive(assessment(10, 1), case(), heavy)
    assert u.score == 4 and "inconsequential item" in "; ".join(u.steps)


def test_low_likelihood_high_impact_is_this_week():
    assert derive(assessment(1, 10), case(), RULES).band == "this_week"


def test_sce_floor_lifts_to_seven():
    u = derive(assessment(2, 7), case(safety_critical_element=True), RULES)
    assert u.score == 7
    assert "safety critical element" in "; ".join(u.steps)


def test_protection_layer_override_needs_type_and_flag():
    sce = case(equipment_type="Pressure Safety Valve", safety_critical_element=True)
    fired = derive(assessment(5, 5, protection_layer_impaired=True), sce, RULES)
    assert fired.score == 9 and fired.overrides[0].id == "protection_layer_impaired_no_deviation"
    recorded = derive(assessment(5, 5, protection_layer_impaired=True, deviation_recorded="yes"), sce, RULES)
    assert recorded.overrides == [] and recorded.score == 5
    wrong_type = derive(assessment(5, 5, protection_layer_impaired=True), case(equipment_type="Structure"), RULES)
    assert wrong_type.overrides == []


def test_evacuation_override():
    u = derive(assessment(3, 9, evacuation_capacity_reduced=True), case(equipment_type="Lifeboat", safety_critical_element=True), RULES)
    assert u.score == 9 and u.overrides[0].id == "evacuation_below_pob"


def test_override_never_lowers():
    u = derive(assessment(10, 10, protection_layer_impaired=True), case(equipment_type="Gas Detector"), RULES)
    assert u.score == 10
