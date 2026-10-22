"""What the model returns for one finding, and what the pipeline keeps about getting it."""

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ScoredDimension(BaseModel):
    model_config = ConfigDict(extra="forbid")
    score: int = Field(ge=1, le=10)
    rationale: str = Field(min_length=1)


class Assessment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=300)
    likelihood_of_failure: ScoredDimension
    impact_of_failure: ScoredDimension
    recommended_action: str = Field(min_length=1, max_length=300)
    confirmed_failure: bool = Field(
        description="The item has already failed to perform a function it is currently required to perform.")
    out_of_service: bool = Field(description="The item is out of service and not required to be in service.")
    protection_layer_impaired: bool = Field(
        description="A layer that prevents or mitigates a major accident is not fully available because of this finding.")
    deviation_recorded: Literal["yes", "no", "unknown"] = Field(
        description="Whether the finding states that the impairment is recorded in the impairment register or a deviation is in place.")
    evacuation_capacity_reduced: bool = Field(
        description="This finding reduces the installation's capacity to evacuate people.")
    uncertainty: Literal["low", "medium", "high"] = Field(
        description="How much the scores depend on facts the finding does not establish.")


AttemptOutcome = Literal["accepted", "validation_error", "invariant_violation", "model_error"]


@dataclass
class Attempt:
    number: int
    outcome: AttemptOutcome
    detail: str
    raw: str
    cached: bool = False


@dataclass
class Verdict:
    assessment: Assessment | None
    violations: list[str] = field(default_factory=list)
    attempts: list[Attempt] = field(default_factory=list)
