"""Step 4: the model call, validated by pydantic, checked against its own flags, retried."""

import time
from dataclasses import asdict, dataclass
from typing import cast

import anthropic
from pydantic import ValidationError

from app.llm import ModelClient, ModelReplyError, ModelRequest, api_schema
from app.models.assessment import Assessment, Attempt, Verdict
from app.models.inputs import Case, NoteKind
from app.models.rules import Rules
from app.pipeline.events import Emitter, silent
from app.pipeline.prompts import system_prompt, user_prompt

MAX_ATTEMPTS = 3
MAX_TOKENS = 16000
SCHEMA: dict = cast(dict, api_schema(Assessment.model_json_schema()))


@dataclass
class Check:
    id: str
    name: str
    applies: bool
    passed: bool
    message: str


def assess(model: ModelClient, model_name: str, case: Case, rules: Rules, emit: Emitter = silent) -> Verdict:
    fid = case.finding.finding_id
    system = system_prompt(rules)
    user = user_prompt(case, rules)
    emit("prompt", "done", "Prompt rendered", {
        "system_chars": len(system), "user_chars": len(user),
        "section": case.equipment.equipment_type, "notes": len(case.notes),
    }, fid)
    messages: list[dict] = [{"role": "user", "content": user}]
    attempts: list[Attempt] = []
    invariants_retried = False
    last_valid: Verdict | None = None
    for number in range(1, MAX_ATTEMPTS + 1):
        request = ModelRequest(model_name, system, list(messages), SCHEMA, MAX_TOKENS, tags=tags_for(case, rules))
        emit("model", "start", f"Calling {model_name}, attempt {number}",
             {"model": model_name, "attempt": number, "max_tokens": MAX_TOKENS, "messages": len(messages)}, fid)
        started = time.perf_counter()
        try:
            reply = model.complete(request)
        except (anthropic.APIError, ModelReplyError) as error:
            emit("model", "fail", f"Attempt {number} failed: {type(error).__name__}",
                 {"attempt": number, "error": str(error), "ms": elapsed_ms(started)}, fid)
            attempts.append(Attempt(number, "model_error", str(error), "", False))
            return Verdict(None, [f"model call failed: {error}"], attempts)
        emit("model", "done", f"Reply in {elapsed_ms(started) / 1000:.1f} s" + (", from cache" if reply.cached else ""),
             {"attempt": number, "ms": elapsed_ms(started), "cached": reply.cached, "usage": reply.usage,
              "chars": len(reply.text)}, fid)
        try:
            assessment = Assessment.model_validate_json(reply.text)
        except ValidationError as error:
            detail = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in error.errors())
            emit("validate", "fail", "Schema rejected the reply, asking for a correction",
                 {"attempt": number, "errors": detail, "retry": True}, fid)
            attempts.append(Attempt(number, "validation_error", detail, reply.text, reply.cached))
            messages.append({"role": "assistant", "content": reply.text})
            messages.append({"role": "user", "content": f"That response failed validation:\n{error}\nReturn a corrected response."})
            continue
        emit("validate", "done", "Reply matches the assessment schema",
             {"attempt": number, "scores": {"likelihood": assessment.likelihood_of_failure.score,
                                           "impact": assessment.impact_of_failure.score}}, fid)
        checks = invariant_checks(assessment, case)
        violations = [c.message for c in checks if not c.passed]
        last_valid = Verdict(assessment, violations, attempts)
        failed = len(violations)
        if violations and not invariants_retried:
            invariants_retried = True
            emit("invariants", "fail", f"{failed} of {len(checks)} checks failed, asking the model to reconsider",
                 {"attempt": number, "checks": [asdict(c) for c in checks], "retry": True}, fid)
            attempts.append(Attempt(number, "invariant_violation", "; ".join(violations), reply.text, reply.cached))
            messages.append({"role": "assistant", "content": reply.text})
            messages.append({"role": "user", "content": "The scores contradict the flags:\n- " + "\n- ".join(violations)
                             + "\nReconsider and return a corrected response."})
            continue
        emit("invariants", "fail" if violations else "done",
             f"{failed} of {len(checks)} checks failed after a retry, kept for review" if violations
             else f"All {len(checks)} checks pass",
             {"attempt": number, "checks": [asdict(c) for c in checks], "retry": False}, fid)
        attempts.append(Attempt(number, "accepted", "; ".join(violations) or "valid, flags consistent", reply.text, reply.cached))
        return last_valid
    if last_valid:
        return last_valid
    return Verdict(None, ["no valid response after retries"], attempts)


def elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def invariant_checks(a: Assessment, case: Case) -> list[Check]:
    L, I = a.likelihood_of_failure.score, a.impact_of_failure.score
    sce = case.equipment.safety_critical_element
    return [
        Check("exclusive_flags", "confirmed_failure and out_of_service are exclusive", True,
              not (a.confirmed_failure and a.out_of_service),
              "confirmed_failure and out_of_service cannot both be true"),
        Check("confirmed_high_likelihood", "confirmed_failure implies likelihood at least 8", a.confirmed_failure,
              not (a.confirmed_failure and L < 8),
              f"confirmed_failure is true but likelihood is {L}; a confirmed failure sits at the top of the range"),
        Check("out_of_service_low_likelihood", "out_of_service implies likelihood at most 4", a.out_of_service,
              not (a.out_of_service and L > 4),
              f"out_of_service is true but likelihood is {L}; an item not required to be in service cannot be likely to fail in service"),
        Check("sce_confirmed_impact", "confirmed failure on a safety critical element implies impact at least 5",
              sce and a.confirmed_failure,
              not (sce and a.confirmed_failure and I < 5),
              f"confirmed failure on a safety critical element but impact is {I}"),
    ]


def invariant_violations(a: Assessment, case: Case) -> list[str]:
    return [c.message for c in invariant_checks(a, case) if not c.passed]


def tags_for(case: Case, rules: Rules) -> dict:
    eq, f = case.equipment, case.finding
    entry = rules.redundancy_vocabulary.get(eq.redundancy)
    return {
        "task": "assess",
        "finding_id": f.finding_id,
        "equipment_id": eq.equipment_id,
        "equipment_type": eq.equipment_type,
        "description": f.finding_description,
        "criticality": eq.criticality_score,
        "reliability": eq.reliability_score,
        "sce": eq.safety_critical_element,
        "redundancy": eq.redundancy,
        "voted": entry is not None and entry.kind == "voted",
        "partner_has_finding": any(n.kind is NoteKind.PARTNER_HAS_FINDING for n in case.notes),
        "protection_layer": eq.equipment_type in rules.protection_layer_types,
        "evacuation": eq.equipment_type in rules.evacuation_types,
    }
