"""Step 3: the rules file rendered as prose for the model."""

from app.models.inputs import Case
from app.models.rules import Rules

ROLE = (
    "You draft triage for a duty integrity engineer on an offshore platform. "
    "Score likelihood of failure and impact of failure only; urgency is computed elsewhere. "
    "A human approves every ticket."
)


class RulesGap(Exception):
    pass


def system_prompt(rules: Rules) -> str:
    sections = {"REGISTRY SCORES": prose(rules.registry_scores.model_dump())}
    sections.update({key.upper(): prose(value) for key, value in rules.general.model_dump().items()})
    body = "\n\n".join(f"{title}\n{render(value)}" for title, value in sections.items())
    return f"{ROLE}\n\n{body}"


def user_prompt(case: Case, rules: Rules) -> str:
    f, eq = case.finding, case.equipment
    section = rules.by_equipment_type.get(eq.equipment_type)
    if section is None:
        raise RulesGap(f"no rules section for equipment type {eq.equipment_type!r}")
    notes = "\n".join(f"- {n.text}" for n in case.notes) or "- none"
    return "\n\n".join([
        "EQUIPMENT TYPE RULES\n" + render([b.text for b in section]),
        "EQUIPMENT\n" + "\n".join([
            f"id: {eq.equipment_id}",
            f"type: {eq.equipment_type}",
            f"service: {eq.service_description}",
            f"criticality: {eq.criticality_score} of 10, where 10 is most critical",
            f"reliability: {eq.reliability_score} of 10, where 10 is highly reliable",
            f"safety critical element: {'yes' if eq.safety_critical_element else 'no'}",
            f"redundancy as written in the registry: {eq.redundancy}",
            f"engineer comment: {eq.engineer_comment}",
        ]),
        "BATCH NOTES\n" + notes,
        "FINDING\n" + "\n".join([
            f"id: {f.finding_id}",
            f"reported: {f.reported_date}",
            f"inspection type: {f.inspection_type}",
            f"inspection method: {f.inspection_method}",
            f"reported by: {f.reporter_role}",
            f"description: {f.finding_description}",
        ]),
        "Score likelihood and impact for this finding. In each rationale, quote the measurement or phrase from the finding it rests on.",
        "Keep summary and recommended_action to at most 300 characters each.",
    ])


def prose(value):
    """Bullets become their text; empty strings disappear."""
    if isinstance(value, dict):
        if set(value) == {"text", "source"}:
            return value["text"]
        out = {}
        for k, v in value.items():
            p = prose(v)
            if p not in ("", None, [], {}):
                out[k] = p
        return out
    if isinstance(value, list):
        return [prose(v) for v in value]
    return value


def render(value, indent: int = 0) -> str:
    pad = "  " * indent
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            label = key.replace("_", " ")
            if isinstance(item, dict) or (isinstance(item, list) and not inline(item)):
                lines.append(f"{pad}{label}:\n{render(item, indent + 1)}")
            else:
                lines.append(f"{pad}{label}: {scalar(item)}")
        return "\n".join(lines)
    if isinstance(value, list):
        return "\n".join(f"{pad}- {scalar(item)}" for item in value)
    return f"{pad}{scalar(value)}"


def inline(items: list) -> bool:
    return all(not isinstance(i, (dict, list)) for i in items) and sum(len(str(i)) for i in items) < 80


def scalar(value) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, list):
        return ", ".join(scalar(i) for i in value)
    return str(value)
