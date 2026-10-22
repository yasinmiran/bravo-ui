"""Platform defaults the extraction prompt states, and the fake model's rules."""

import re

from app.pipeline.notes import PARTNER_TAG

DEFAULT_BANDS = {"today": [9, 10], "this_week": [7, 8], "this_month": [5, 6],
                 "next_planned_shutdown": [3, 4], "backlog": [1, 2]}
DEFAULT_URGENCY = {
    "weights": {"impact": 0.7, "likelihood": 0.3},
    "near_certain": {"likelihood_at_least": 9},
    "inconsequential": {"impact_at_most": 3, "urgency_at_most": 4},
    "sce_floor": {"impact_at_least": 7, "urgency_at_least": 7},
}
DEFAULT_OVERRIDES = [
    {"id": "protection_layer_impaired_no_deviation",
     "condition": "a protection layer is impaired and no deviation is recorded",
     "reason": "the installation is out of compliance from the moment the impairment is known",
     "floor": 9},
    {"id": "evacuation_below_pob",
     "condition": "evacuation capacity is reduced below the POB count",
     "reason": "same compliance logic as an impaired protection layer",
     "floor": 9},
]

PROTECTION_LAYER_HINTS = ("safety valve", "detector", "deluge", "firewater", "hvac", "fire", "esd", "shutdown valve")
EVACUATION_HINTS = ("lifeboat", "liferaft", "evacuation", "muster")
FIRST_SENTENCE = re.compile(r"(?<=[.!?])\s+")


def b(text: str, source: str) -> dict:
    return {"text": text, "source": source}


def classify_redundancy(value: str) -> dict:
    low = value.strip().lower()
    if low in ("none", "no", "n/a", ""):
        return {"kind": "none", "partner": "", "note": ""}
    if "bypass" in low:
        return {"kind": "bypass", "partner": "", "note": "can be isolated or bypassed without loss of function"}
    if low.startswith("voted") or re.search(r"\doo\d", low):
        return {"kind": "voted", "partner": "", "note": "one member lost is a degradation, not a defeat; margin is gone"}
    m = PARTNER_TAG.search(value)
    if m:
        return {"kind": "partner", "partner": m.group(1), "note": "credit only if the partner is healthy this period"}
    return {"kind": "none", "partner": "", "note": "could not classify; treated as no redundancy"}


def fake_rules(equipments: list[dict], domain_text: str) -> dict:
    types = sorted({e["equipment_type"] for e in equipments})
    values = sorted({e["redundancy"] for e in equipments})
    by_type = {}
    for t in types:
        bullets = []
        for e in equipments:
            if e["equipment_type"] == t and e["engineer_comment"]:
                for sentence in FIRST_SENTENCE.split(e["engineer_comment"])[:2]:
                    bullets.append(b(sentence.rstrip("."), f"registry: {e['equipment_id']}"))
        by_type[t] = bullets or [b("the sources say nothing specific about this equipment type", "inferred")]
    sce_types = {e["equipment_type"] for e in equipments if e["safety_critical_element"]}
    protection = [t for t in types if t in sce_types and any(h in t.lower() for h in PROTECTION_LAYER_HINTS)]
    evacuation = [t for t in types if any(h in t.lower() for h in EVACUATION_HINTS)]
    return {
        "version": 1,
        "source": "handover notes and equipment registry engineer comments (fake extraction)",
        "registry_scores": {
            "criticality_score": {"range": [1, 10], "direction": "normal", "starting_point_for": "impact", "warning": ""},
            "reliability_score": {"range": [1, 10], "direction": "inverted", "starting_point_for": "likelihood",
                                  "warning": "runs opposite to likelihood; new starters routinely invert it"},
            "note": "neither is sufficient alone; the finding text moves both. A reliable item with a crack in it is still cracked.",
        },
        "general": {
            "likelihood": {
                "concerns": "the item itself, given what the inspection found; how likely it is to stop performing its function in the near term",
                "scope": "",
                "up": [b("a trend that is still moving", "notes: What moves likelihood"),
                       b("a repeat of a failure that has already occurred this period", "notes: What moves likelihood"),
                       b("an active, unmitigated mechanism; corrosion under wet insulation is progressing now", "notes: What moves likelihood"),
                       b("detection by a method that only catches late-stage damage; a finding heard or smelled is further advanced than one found by UT", "notes: What moves likelihood"),
                       b("a confirmed functional failure that has already occurred sits at the top of the range", "inferred")],
                "down": [b("design margin", "notes: What moves likelihood"),
                         b("a measurement inside its acceptance criterion", "notes: What moves likelihood"),
                         b("an item that is out of service and not required to be in service", "notes: What moves likelihood")],
            },
            "impact": {
                "concerns": "what happens if it does fail; depends on what the equipment does and what sits behind it, not on the wording of the finding",
                "scope": "the consequence of the failure mode this finding points to, not the worst thing this equipment could ever do; a finding that touches only appearance, labels or records has housekeeping consequences even on a critical item",
                "up": [b("absence of redundancy", "notes: What moves impact"),
                       b("a Safety Critical Element, judged against the major accident it protects against, not repair cost", "notes: What moves impact"),
                       b("a failure that degrades a protection layer rather than causing direct loss", "notes: What moves impact"),
                       b("delayed or hidden consequences; loss of corrosion inhibitor has no effect today and a substantial effect in eighteen months", "notes: What moves impact"),
                       b("escalation potential", "notes: What moves impact")],
                "down": [b("redundancy that is available and capable; if findings exist against both legs of a pair in the same period, the pair is not redundant", "notes: Two recurring errors"),
                         b("an item that can be bypassed without loss of function", "notes: What moves impact"),
                         b("atmospheric, non-hydrocarbon, low-energy service", "notes: What moves impact"),
                         b("consequences limited to housekeeping or appearance", "notes: What moves impact")],
            },
            "pitfalls": [b("scoring by how severe the description sounds", "notes: The two questions"),
                         b("inverting reliability_score", "notes: Registry scores"),
                         b("crediting redundancy without checking the partner; a partner with a finding this period is not a backup", "notes: Two recurring errors"),
                         b("treating one head lost from a voted group as a defeat; it is a degradation, impact moderate, and time-limited because the next failure defeats it", "notes: Two recurring errors"),
                         b("resolving uncertainty by picking a mid-range score", "notes: Output expectations")],
            "output": {
                "summary": {"must_cover": ["what is wrong", "on what", "why it matters"],
                            "readable_without_inspection_record": True,
                            "not_a_restatement_of_finding_text": True,
                            "must_not_omit": ["a measurement", "a repeat occurrence", "a standby already unavailable"]},
                "recommended_action": "names a specific activity; investigate further is not sufficient",
                "uncertainty": "state it explicitly; never resolve it with a mid-range score",
                "loss_of_confidence_causes": ["confidently incorrect scores on safety critical equipment",
                                              "a summary that omits a decision-changing detail",
                                              "the same finding scored differently on different days",
                                              "uniform mid-range scores across all findings"],
            },
        },
        "by_equipment_type": by_type,
        "redundancy_vocabulary": {v: classify_redundancy(v) for v in values},
        "protection_layer_types": protection,
        "evacuation_types": evacuation,
        "urgency_bands": DEFAULT_BANDS,
        "urgency": DEFAULT_URGENCY,
        "overrides": DEFAULT_OVERRIDES,
    }
