"""The output contract: one ticket per finding, and the file that holds them."""

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.assessment import ScoredDimension


class Ticket(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket_id: str = Field(pattern=r"^TKT-[A-Za-z0-9-]+$")
    finding_id: str
    equipment_id: str
    summary: str = Field(min_length=1, max_length=300)
    likelihood_of_failure: ScoredDimension
    impact_of_failure: ScoredDimension
    urgency: ScoredDimension
    recommended_action: str = Field(min_length=1, max_length=300)
    review_required: bool
    review_reason: str | None

    @model_validator(mode="after")
    def reason_when_required(self) -> "Ticket":
        if self.review_required and not self.review_reason:
            raise ValueError("review_reason is required when review_required is true")
        return self


class TicketFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    generated_at: str
    tickets_generated: int
    tickets: list[Ticket]
