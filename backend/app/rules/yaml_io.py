"""The rules file on disk and in the editor is YAML; in code it is `Rules`."""

import yaml
from pydantic import ValidationError

from app.models.rules import Rules

HEADER = """\
# Triage rules. Two readers.
#
# The model gets `general`, `registry_scores` and the matching `by_equipment_type`
# section rendered as prose, one finding at a time. Code reads `redundancy_vocabulary`,
# `protection_layer_types`, `evacuation_types`, `urgency_bands`, `urgency` and
# `overrides`. Review triggers live in code.
#
# Every bullet carries its source: "notes: <section>" for the handover document,
# "registry: <equipment id>" for an engineer comment, "inferred" for a choice no
# source states. Nothing in this file comes from a findings file.
"""


def to_yaml(rules: Rules) -> str:
    body = yaml.safe_dump(rules.model_dump(), sort_keys=False, allow_unicode=True, width=110)
    return HEADER + "\n" + body


def from_yaml(text: str) -> Rules:
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise ValueError(f"not valid YAML: {error}") from error
    if not isinstance(data, dict):
        raise ValueError("the rules file must be a mapping at the top level")
    try:
        return Rules.model_validate(data)
    except ValidationError as error:
        lines = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in error.errors()]
        raise ValueError("rules do not match the schema:\n" + "\n".join(lines)) from error
