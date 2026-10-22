"""The rules file. Two readers: the model gets `general`, `registry_scores` and one
`by_equipment_type` section as prose; code reads everything from `redundancy_vocabulary`
down. Every field is required so the extraction schema has no defaults or nulls."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BAND_NAMES = ("today", "this_week", "this_month", "next_planned_shutdown", "backlog")
OVERRIDE_IDS = ("protection_layer_impaired_no_deviation", "evacuation_below_pob")
OverrideId = Literal["protection_layer_impaired_no_deviation", "evacuation_below_pob"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Bullet(Strict):
    text: str = Field(description="One rule, in plain prose, as the integrity engineer would say it.")
    source: str = Field(description=(
        "Where this came from: 'notes: <section heading>' for the handover document, "
        "'registry: <equipment_id>' for an engineer comment, 'inferred' for a choice the sources do not state."
    ))


class RegistryScore(Strict):
    range: list[int] = Field(description="Two integers, lowest and highest value in the registry.")
    direction: Literal["normal", "inverted"] = Field(description=(
        "normal when a higher score means more of the thing scored (10 = most critical); "
        "inverted when a higher score means less likely to fail (10 = highly reliable)."
    ))
    starting_point_for: Literal["impact", "likelihood"]
    warning: str = Field(description="A trap readers fall into with this score, or an empty string.")


class RegistryScores(Strict):
    criticality_score: RegistryScore
    reliability_score: RegistryScore
    note: str = Field(description="How the two scores relate to the finding text.")


class Dimension(Strict):
    concerns: str = Field(description="What this dimension is about, one sentence.")
    scope: str = Field(description=(
        "What the score covers and what it must not cover. For impact, the consequence of the failure mode "
        "this finding points to rather than the worst thing the equipment could ever do. Empty string if the notes give no scope."
    ))
    up: list[Bullet] = Field(description="What moves the score up.")
    down: list[Bullet] = Field(description="What moves the score down.")


class SummaryRules(Strict):
    must_cover: list[str]
    readable_without_inspection_record: bool
    not_a_restatement_of_finding_text: bool
    must_not_omit: list[str] = Field(description="Details whose omission changes the decision.")


class OutputRules(Strict):
    summary: SummaryRules
    recommended_action: str
    uncertainty: str = Field(description="How to handle an uncertain assessment.")
    loss_of_confidence_causes: list[str] = Field(description="Ordered, worst first.")


class General(Strict):
    likelihood: Dimension
    impact: Dimension
    pitfalls: list[Bullet] = Field(description="Recurring errors the notes warn about.")
    output: OutputRules


class RedundancyEntry(Strict):
    kind: Literal["none", "bypass", "voted", "partner"] = Field(description=(
        "none: no backup. bypass: can be isolated or bypassed without loss of function. "
        "voted: a voting group such as 2oo3. partner: a named redundant partner."
    ))
    partner: str = Field(description="Equipment id of the redundant partner for kind partner, else an empty string.")
    note: str = Field(description="What this arrangement means for impact, one sentence, or an empty string.")


class UrgencyWeights(Strict):
    impact: float
    likelihood: float


class NearCertain(Strict):
    likelihood_at_least: int = Field(description="At or above this likelihood, urgency is lifted to at least the impact score.")


class Inconsequential(Strict):
    impact_at_most: int
    urgency_at_most: int = Field(description="At or below impact_at_most, urgency is capped here.")


class SceFloor(Strict):
    impact_at_least: int
    urgency_at_least: int = Field(description="A safety critical element at or above impact_at_least gets at least this urgency.")


class UrgencyRules(Strict):
    weights: UrgencyWeights = Field(description="Weights for the base score; they sum to 1 and impact weighs more.")
    near_certain: NearCertain
    inconsequential: Inconsequential
    sce_floor: SceFloor


class UrgencyBands(Strict):
    today: list[int] = Field(description="Two integers, inclusive range.")
    this_week: list[int]
    this_month: list[int]
    next_planned_shutdown: list[int]
    backlog: list[int]


class Override(Strict):
    id: OverrideId
    condition: str = Field(description="The condition in the notes' words.")
    reason: str = Field(description="Why it overrides, in the notes' words.")
    floor: int = Field(description="Urgency is lifted to at least this value when the override fires.")


class Rules(Strict):
    version: int
    source: str = Field(description="The documents this file was drawn from.")
    registry_scores: RegistryScores
    general: General
    by_equipment_type: dict[str, list[Bullet]] = Field(description=(
        "One list of bullets per equipment type, keyed exactly by the registry's equipment_type string."
    ))
    redundancy_vocabulary: dict[str, RedundancyEntry] = Field(description=(
        "One entry per distinct redundancy string in the registry, keyed by that exact string."
    ))
    protection_layer_types: list[str] = Field(description=(
        "Equipment types whose impairment leaves a protection layer against a major accident impaired."
    ))
    evacuation_types: list[str] = Field(description="Equipment types whose defect reduces evacuation capacity.")
    urgency_bands: UrgencyBands
    urgency: UrgencyRules
    overrides: list[Override]

    def band_of(self, score: int) -> str:
        for name in BAND_NAMES:
            low, high = getattr(self.urgency_bands, name)
            if low <= score <= high:
                return name
        raise ValueError(f"urgency {score} is outside every band")

    def band_range(self, name: str) -> tuple[int, int]:
        low, high = getattr(self.urgency_bands, name)
        return low, high


class TypeSection(Strict):
    equipment_type: str = Field(description="One of the registry's equipment types, exactly as listed.")
    rules: list[Bullet] = Field(description="What the sources say about this kind of equipment.")


class RedundancyItem(RedundancyEntry):
    value: str = Field(description="One of the registry's redundancy strings, exactly as written.")


class RulesDraft(Rules):
    """The shape the model writes. Lists carry the registry closure as enums, which keeps the
    structured-output grammar small; `Rules` keys the same data by type and string."""

    by_equipment_type: list[TypeSection]  # type: ignore[assignment]
    redundancy_vocabulary: list[RedundancyItem]  # type: ignore[assignment]

    def to_rules(self) -> Rules:
        data = self.model_dump()
        sections: dict[str, list[dict]] = {}
        for section in self.by_equipment_type:
            sections.setdefault(section.equipment_type, []).extend(b.model_dump() for b in section.rules)
        data["by_equipment_type"] = sections
        data["redundancy_vocabulary"] = {
            item.value: {"kind": item.kind, "partner": item.partner, "note": item.note} for item in self.redundancy_vocabulary
        }
        return Rules.model_validate(data)


def draft_of(rules: dict) -> dict:
    """A rules dict in the keyed shape, rewritten as the model would have written it."""
    out = dict(rules)
    out["by_equipment_type"] = [{"equipment_type": t, "rules": bullets} for t, bullets in rules["by_equipment_type"].items()]
    out["redundancy_vocabulary"] = [{"value": v, **entry} for v, entry in rules["redundancy_vocabulary"].items()]
    return out
