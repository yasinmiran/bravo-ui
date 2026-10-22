"""Semantic checks on a rules file against the registry it will be used with."""

from dataclasses import dataclass
from typing import Literal

from app.models.inputs import Equipment
from app.models.rules import BAND_NAMES, OVERRIDE_IDS, Rules
from app.pipeline.notes import PARTNER_TAG


@dataclass
class Issue:
    level: Literal["error", "warning"]
    code: str
    message: str


def check(rules: Rules, equipments: list[Equipment]) -> list[Issue]:
    issues: list[Issue] = []
    types = sorted({e.equipment_type for e in equipments})
    values = sorted({e.redundancy for e in equipments})
    ids = {e.equipment_id for e in equipments}

    for t in types:
        if t not in rules.by_equipment_type:
            issues.append(Issue("error", "type_without_section", f"Equipment type {t!r} has no by_equipment_type section."))
        elif not rules.by_equipment_type[t]:
            issues.append(Issue("warning", "empty_section", f"Section for {t!r} has no bullets."))
    for t in rules.by_equipment_type:
        if t not in types:
            issues.append(Issue("warning", "section_without_type", f"Section {t!r} matches no equipment type in the registry."))

    for v in values:
        entry = rules.redundancy_vocabulary.get(v)
        if entry is None:
            issues.append(Issue("error", "redundancy_unclassified", f"Redundancy value {v!r} is not in redundancy_vocabulary."))
            continue
        if entry.kind == "partner":
            partner = entry.partner or (m.group(1) if (m := PARTNER_TAG.search(v)) else "")
            if not partner:
                issues.append(Issue("error", "partner_unnamed", f"Redundancy value {v!r} is kind partner but names no partner."))
            elif partner not in ids:
                issues.append(Issue("warning", "partner_not_in_registry",
                                    f"Partner {partner} for {v!r} is not in the registry; it will be treated as unverified."))
    for v in rules.redundancy_vocabulary:
        if v not in values:
            issues.append(Issue("warning", "vocabulary_unused", f"Vocabulary entry {v!r} matches no registry value."))

    for name, kind in (("protection_layer_types", "protection layer"), ("evacuation_types", "evacuation")):
        for t in getattr(rules, name):
            if t not in types:
                issues.append(Issue("warning", "list_type_unknown", f"{name} names {t!r}, which is not an equipment type in the registry."))

    covered: dict[int, str] = {}
    for name in BAND_NAMES:
        rng = getattr(rules.urgency_bands, name)
        if len(rng) != 2 or rng[0] > rng[1]:
            issues.append(Issue("error", "band_malformed", f"Band {name} must be [low, high], got {rng}."))
            continue
        for s in range(rng[0], rng[1] + 1):
            if s in covered:
                issues.append(Issue("error", "band_overlap", f"Urgency {s} is in both {covered[s]} and {name}."))
            covered[s] = name
    missing = [s for s in range(1, 11) if s not in covered]
    if missing:
        issues.append(Issue("error", "band_gap", f"No urgency band covers {missing}."))

    w = rules.urgency.weights
    if abs(w.impact + w.likelihood - 1.0) > 0.01:
        issues.append(Issue("error", "weights_sum", f"Urgency weights sum to {w.impact + w.likelihood:.2f}, not 1."))
    for label, value in (("weights.impact", w.impact), ("weights.likelihood", w.likelihood)):
        if not 0 <= value <= 1:
            issues.append(Issue("error", "weights_range", f"{label} is {value}; a weight lies between 0 and 1."))
    if w.impact < w.likelihood:
        issues.append(Issue("warning", "weights_order", "Impact is weighted below likelihood; the notes say impact leads."))
    for label, value in (("near_certain.likelihood_at_least", rules.urgency.near_certain.likelihood_at_least),
                         ("inconsequential.impact_at_most", rules.urgency.inconsequential.impact_at_most),
                         ("inconsequential.urgency_at_most", rules.urgency.inconsequential.urgency_at_most),
                         ("sce_floor.impact_at_least", rules.urgency.sce_floor.impact_at_least),
                         ("sce_floor.urgency_at_least", rules.urgency.sce_floor.urgency_at_least)):
        if not 1 <= value <= 10:
            issues.append(Issue("error", "urgency_number_range", f"urgency.{label} must be 1 to 10, got {value}."))

    seen = set()
    for o in rules.overrides:
        if o.id in seen:
            issues.append(Issue("error", "override_duplicate", f"Override {o.id} appears twice."))
        seen.add(o.id)
        if not 1 <= o.floor <= 10:
            issues.append(Issue("error", "override_floor_range", f"Override {o.id} floor must be 1 to 10, got {o.floor}."))
    for oid in OVERRIDE_IDS:
        if oid not in seen:
            issues.append(Issue("warning", "override_missing", f"Override {oid} is not defined; it will never fire."))
    for score_name, s in (("criticality_score", rules.registry_scores.criticality_score),
                          ("reliability_score", rules.registry_scores.reliability_score)):
        if len(s.range) != 2:
            issues.append(Issue("error", "score_range", f"registry_scores.{score_name}.range must have two values."))
    if rules.registry_scores.reliability_score.direction != "inverted":
        issues.append(Issue("warning", "reliability_direction",
                            "reliability_score is not marked inverted; the notes say 10 means highly reliable."))
    return issues


def has_errors(issues: list[Issue]) -> bool:
    return any(i.level == "error" for i in issues)
