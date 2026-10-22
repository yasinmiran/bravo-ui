"""Rules extraction: a domain document and a registry become a rules file, by one
structured model call whose schema closes over the registry's own vocabulary."""

import copy
import time
from dataclasses import asdict, dataclass, field
from typing import cast

from pydantic import ValidationError

from app.llm import ModelClient, ModelRequest, api_schema
from app.models.assessment import Attempt
from app.models.inputs import Equipment
from app.models.rules import Rules, RulesDraft
from app.pipeline.events import Emitter, silent
from app.rules.template import DEFAULT_BANDS, DEFAULT_OVERRIDES, DEFAULT_URGENCY
from app.rules.validate import Issue, check, has_errors

MAX_ATTEMPTS = 4
MAX_TOKENS = 32000

SYSTEM = """You turn an integrity engineer's handover notes and an equipment registry into a triage rules file.

The file has two readers. A language model reads `general`, `registry_scores` and the `by_equipment_type` section for one finding's equipment type, rendered as prose, when it scores likelihood of failure and impact of failure for that finding. Code reads `redundancy_vocabulary`, `protection_layer_types`, `evacuation_types`, `urgency_bands`, `urgency` and `overrides`. Urgency is never scored by the model; code derives it from likelihood and impact with the numbers in `urgency`, then lifts it with `overrides`.

How to write it:
- Every bullet names its source. "notes: <section heading>" for the handover document, "registry: <equipment_id>" for an engineer comment, "inferred" for a choice the sources do not state. Quote or closely paraphrase. Do not invent domain facts.
- `general` holds what the notes say about likelihood, impact, recurring errors and output expectations. Keep the notes' own examples; they carry the calibration.
- `by_equipment_type` is a list with one section per equipment type, `equipment_type` exactly as listed and every type present. Draw bullets from the engineer comments on equipment of that type and from the notes where they speak about that kind of equipment. If the sources say nothing specific about a type, write one bullet that says so, source "inferred". Never put a finding-specific measurement into a rule.
- `redundancy_vocabulary` is a list with one entry per listed redundancy string, `value` exactly as written, every string present. none: no backup. bypass: can be isolated or bypassed without loss of function. voted: a voting group such as 2oo3. partner: a named redundant partner; put its equipment id in `partner`.
- `protection_layer_types` lists the equipment types whose impairment leaves a protection layer against a major accident impaired. `evacuation_types` lists those whose defect reduces evacuation capacity. Decide from the notes and the comments; use only the listed types.
- `urgency_bands`: the bands the notes give. If the notes give none, use %(bands)s.
- `urgency`: the notes give the shape, not the numbers. Unless the notes state otherwise use weights impact %(wi)s and likelihood %(wl)s, lift to at least the impact score when likelihood is at least %(nc)s, cap at %(cap_u)s when impact is at most %(cap_i)s, and give a safety critical element with impact at least %(sce_i)s an urgency of at least %(sce_u)s.
- `overrides`: exactly the two supported ids. Write their condition and reason in the notes' words. Floor %(floor)s unless the notes say the override means the top of the scale.
- You have no findings file. Nothing in this rules file may come from one.
""" % {
    "bands": ", ".join(f"{k.replace('_', ' ')} {v[0]} to {v[1]}" for k, v in DEFAULT_BANDS.items()),
    "wi": DEFAULT_URGENCY["weights"]["impact"], "wl": DEFAULT_URGENCY["weights"]["likelihood"],
    "nc": DEFAULT_URGENCY["near_certain"]["likelihood_at_least"],
    "cap_u": DEFAULT_URGENCY["inconsequential"]["urgency_at_most"], "cap_i": DEFAULT_URGENCY["inconsequential"]["impact_at_most"],
    "sce_i": DEFAULT_URGENCY["sce_floor"]["impact_at_least"], "sce_u": DEFAULT_URGENCY["sce_floor"]["urgency_at_least"],
    "floor": DEFAULT_OVERRIDES[0]["floor"],
}


class ExtractionError(Exception):
    pass


@dataclass
class Extraction:
    rules: Rules
    issues: list[Issue]
    attempts: list[Attempt]
    usage: dict = field(default_factory=dict)


def extraction_schema(types: list[str], redundancy_values: list[str]) -> dict:
    """The registry's own vocabulary as the only admissible values. Enums on list entries, not one
    required key per value: the API compiles the schema to a grammar, and a keyed object repeats
    the nested grammar once per key, which it rejects as too large for a real registry."""
    schema = cast(dict, copy.deepcopy(api_schema(RulesDraft.model_json_schema())))
    defs = schema["$defs"]
    defs["TypeSection"]["properties"]["equipment_type"]["enum"] = list(types)
    defs["RedundancyItem"]["properties"]["value"]["enum"] = list(redundancy_values)
    for name in ("protection_layer_types", "evacuation_types"):
        schema["properties"][name]["items"] = {"type": "string", "enum": list(types)}
    return schema


def user_prompt(domain_text: str, equipments: list[Equipment], types: list[str], values: list[str]) -> str:
    rows = "\n".join(
        f"- {e.equipment_id} | {e.equipment_type} | {e.service_description} | criticality {e.criticality_score} | "
        f"reliability {e.reliability_score} | SCE {'yes' if e.safety_critical_element else 'no'} | redundancy: {e.redundancy}\n"
        f"  engineer comment: {e.engineer_comment}"
        for e in equipments
    )
    return "\n\n".join([
        "HANDOVER NOTES\n" + domain_text.strip(),
        "EQUIPMENT REGISTRY\n" + rows,
        "EQUIPMENT TYPES (one section each, exactly these)\n" + "\n".join(f"- {t}" for t in types),
        "REDUNDANCY STRINGS (classify exactly these)\n" + "\n".join(f"- {v}" for v in values),
        "Write the rules file.",
    ])


def extract_rules(model: ModelClient, model_name: str, domain_text: str, equipments: list[Equipment],
                  emit: Emitter = silent) -> Extraction:
    types = sorted({e.equipment_type for e in equipments})
    values = sorted({e.redundancy for e in equipments})
    schema = extraction_schema(types, values)
    prompt = user_prompt(domain_text, equipments, types, values)
    emit("schema", "done", f"Schema in the prompt, closed over {len(types)} equipment types and {len(values)} redundancy strings", {
        "constrained": False,
        "equipment_types": types, "redundancy_values": values,
        "required_keys": sorted(schema.get("required", [])),
        "system_chars": len(SYSTEM), "user_chars": len(prompt),
    })
    messages: list[dict] = [{"role": "user", "content": prompt}]
    tags = {"task": "extract", "equipments": [asdict(e) for e in equipments], "domain_text": domain_text}
    attempts: list[Attempt] = []
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}
    coverage_retried = False
    for number in range(1, MAX_ATTEMPTS + 1):
        emit("model", "start", f"Calling {model_name}, attempt {number}, streaming",
             {"model": model_name, "attempt": number, "max_tokens": MAX_TOKENS, "stream": True, "messages": len(messages)})
        started = time.perf_counter()
        try:
            reply = model.complete(ModelRequest(model_name, SYSTEM, list(messages), schema, MAX_TOKENS, stream=True, constrained=False, tags=tags))
        except Exception as error:
            emit("model", "fail", f"Attempt {number} failed: {type(error).__name__}",
                 {"attempt": number, "error": str(error), "ms": int((time.perf_counter() - started) * 1000)})
            raise
        ms = int((time.perf_counter() - started) * 1000)
        emit("model", "done", f"Reply in {ms / 1000:.1f} s" + (", from cache" if reply.cached else ""),
             {"attempt": number, "ms": ms, "cached": reply.cached, "usage": reply.usage, "chars": len(reply.text)})
        for k in usage:
            usage[k] += reply.usage.get(k, 0)
        try:
            rules = RulesDraft.model_validate_json(reply.text).to_rules()
        except ValidationError as error:
            detail = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in error.errors())
            emit("validate", "fail", "Schema rejected the rules file, asking for a correction", {"attempt": number, "errors": detail, "retry": True})
            attempts.append(Attempt(number, "validation_error", detail, reply.text, reply.cached))
            messages.append({"role": "assistant", "content": reply.text})
            messages.append({"role": "user", "content": f"That response failed validation:\n{error}\nReturn a corrected rules file."})
            continue
        emit("validate", "done", "Rules file matches the schema", {
            "attempt": number, "sections": len(rules.by_equipment_type), "vocabulary": len(rules.redundancy_vocabulary),
            "protection_layer_types": rules.protection_layer_types, "evacuation_types": rules.evacuation_types,
        })
        issues = check(rules, equipments)
        errors = [i.message for i in issues if i.level == "error"]
        warnings = [i.message for i in issues if i.level == "warning"]
        if has_errors(issues) and not coverage_retried:
            coverage_retried = True
            emit("coverage", "fail", f"{len(errors)} coverage gap(s), asking for a corrected file",
                 {"attempt": number, "errors": errors, "warnings": warnings, "retry": True})
            attempts.append(Attempt(number, "invariant_violation", "; ".join(errors), reply.text, reply.cached))
            messages.append({"role": "assistant", "content": reply.text})
            messages.append({"role": "user", "content": "The rules file has gaps:\n- " + "\n- ".join(errors) + "\nReturn a corrected rules file."})
            continue
        emit("coverage", "fail" if errors else "done",
             f"{len(errors)} coverage gap(s) remain after a retry" if errors
             else f"Covers the assets" + (f", {len(warnings)} {'note' if len(warnings) == 1 else 'notes'}" if warnings else ""),
             {"attempt": number, "errors": errors, "warnings": warnings, "retry": False})
        attempts.append(Attempt(number, "accepted", "valid" + ("" if not issues else f", {len(issues)} issue(s) noted"), reply.text, reply.cached))
        return Extraction(rules, issues, attempts, usage)
    raise ExtractionError("no valid rules file after retries: " + "; ".join(a.detail for a in attempts[-2:]))
