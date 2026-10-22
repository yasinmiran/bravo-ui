"""Model access. One protocol, three implementations: Anthropic, a SQLite cache in
front of it, and a deterministic fake for development and tests."""

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from typing import Protocol

import anthropic

from app import db

UNSUPPORTED_SCHEMA_KEYS = {"minimum", "maximum", "minLength", "maxLength",
                           "exclusiveMinimum", "exclusiveMaximum", "title"}


def api_schema(node: object) -> object:
    if isinstance(node, dict):
        return {k: api_schema(v) for k, v in node.items() if k not in UNSUPPORTED_SCHEMA_KEYS}
    if isinstance(node, list):
        return [api_schema(i) for i in node]
    return node


class ModelReplyError(Exception):
    pass


@dataclass
class ModelRequest:
    model: str
    system: str
    messages: list[dict]
    schema: dict
    max_tokens: int
    stream: bool = False
    # Grammar-constrained decoding. Off when the schema is too large for the API's compiler;
    # the schema then travels in the prompt and the caller validates the reply.
    constrained: bool = True
    tags: dict = field(default_factory=dict)


@dataclass
class ModelReply:
    text: str
    usage: dict
    cached: bool = False


class ModelClient(Protocol):
    def complete(self, request: ModelRequest) -> ModelReply: ...


SCHEMA_IN_PROMPT = (
    "\n\nReturn one JSON object and nothing else: no prose before or after it, no code fence. "
    "It must validate against this JSON schema:\n%s"
)


def strip_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


class AnthropicModel:
    def __init__(self, client: anthropic.Anthropic | None = None):
        self.client = client or anthropic.Anthropic()

    def complete(self, request: ModelRequest) -> ModelReply:
        kwargs = dict(
            model=request.model,
            max_tokens=request.max_tokens,
            system=request.system,
            messages=request.messages,
        )
        if request.constrained:
            kwargs["output_config"] = {"format": {"type": "json_schema", "schema": request.schema}}
        else:
            kwargs["system"] = request.system + SCHEMA_IN_PROMPT % json.dumps(request.schema)
        if request.stream:
            with self.client.messages.stream(**kwargs) as stream:
                response = stream.get_final_message()
        else:
            response = self.client.messages.create(**kwargs)
        if response.stop_reason == "refusal":
            details = response.stop_details
            raise ModelReplyError(f"model refused ({details.category if details else 'no category'})")
        text = next((block.text for block in response.content if block.type == "text"), None)
        if text is None or response.stop_reason == "max_tokens":
            raise ModelReplyError(f"no complete text block (stop_reason={response.stop_reason})")
        if not request.constrained:
            text = strip_fence(text)
        usage = response.usage
        return ModelReply(text, {
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        })


class CachedModel:
    """Keyed on everything the model sees. Same prompt, same reply, no second call."""

    def __init__(self, inner: ModelClient):
        self.inner = inner

    def complete(self, request: ModelRequest) -> ModelReply:
        key = hashlib.sha256(json.dumps(
            [request.model, request.schema, request.system, request.messages], sort_keys=True
        ).encode()).hexdigest()
        with db.connect() as conn:
            hit = db.one(conn, "SELECT text, usage FROM model_cache WHERE key = ?", (key,))
        if hit:
            return ModelReply(hit["text"], db.loads(hit["usage"], {}), cached=True)
        reply = self.inner.complete(request)
        with db.write() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO model_cache(key, model, text, usage, created_at) VALUES (?,?,?,?,?)",
                (key, request.model, reply.text, db.dumps(reply.usage), db.now()),
            )
        return reply


CONFIRMED = ("failed to start", "did not respond", "did not operate", "declared unavailable",
             "has tripped", "withheld the certificate", "failed to respond")
OUT_OF_SERVICE = ("not currently in service", "not in service")
SERIOUS = ("crack", "minimum allowable", "below", "chained in the closed position", "no flow")
TRENDING = ("climbed", "growing", "has not plateaued", "diverg", "intermittent")
COSMETIC = ("illegible", "dirty", "coating breakdown", "flapping", "lagging", "hard to read")
FIRST_SENTENCE = re.compile(r"(?<=[.!?])\s+")


class FakeModel:
    """Deterministic stand-in. Reads the request tags, never the prompt, and returns
    plausible JSON so the whole platform runs without an API key. The delay stands
    in for network latency so a live screen has something to show."""

    EXTRACT_SLOWDOWN = 5  # one big streaming call versus many small ones

    def __init__(self, delay: float = 0.0):
        self.delay = delay

    def complete(self, request: ModelRequest) -> ModelReply:
        task = request.tags.get("task")
        if self.delay:
            time.sleep(self.delay * (self.EXTRACT_SLOWDOWN if task == "extract" else 1))
        if task == "assess":
            text = json.dumps(self.assess(request))
        elif task == "extract":
            text = json.dumps(self.extract(request))
        else:
            raise ModelReplyError(f"fake model has no handler for task {task!r}")
        return ModelReply(text, {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0})

    def assess(self, request: ModelRequest) -> dict:
        t = request.tags
        desc = t["description"].lower()
        attempt = (len(request.messages) + 1) // 2
        confirmed = any(k in desc for k in CONFIRMED)
        out_of_service = any(k in desc for k in OUT_OF_SERVICE) and not confirmed
        cosmetic = any(k in desc for k in COSMETIC) and not confirmed
        if confirmed:
            likelihood = 9 if "second attempt" in desc else 10
        elif out_of_service:
            likelihood = 2
        elif any(k in desc for k in SERIOUS):
            likelihood = 8
        elif any(k in desc for k in TRENDING):
            likelihood = 7
        elif cosmetic:
            likelihood = 3
        else:
            likelihood = max(3, min(7, 11 - t["reliability"]))
        if cosmetic:
            impact = 3
        else:
            impact = t["criticality"]
            if t["sce"]:
                impact = max(impact, 7)
            if t.get("voted"):
                impact = min(impact, 7)
            if t.get("partner_has_finding"):
                impact = min(10, impact + 1)
        if t["finding_id"].endswith("14") and attempt == 1 and out_of_service:
            likelihood = 5
        summary = f"{t['equipment_type']} {t['equipment_id']}: {FIRST_SENTENCE.split(t['description'])[0]}"
        if t["finding_id"].endswith("03") and attempt == 1:
            summary = summary + " " + t["description"]
        return {
            "summary": summary[:300] if attempt > 1 else summary,
            "likelihood_of_failure": {
                "score": likelihood,
                "rationale": f"Fake model: keyed on the finding text '{FIRST_SENTENCE.split(t['description'])[0]}' with reliability {t['reliability']} as the prior.",
            },
            "impact_of_failure": {
                "score": impact,
                "rationale": f"Fake model: criticality {t['criticality']}, safety critical element {'yes' if t['sce'] else 'no'}, redundancy as written '{t['redundancy']}'.",
            },
            "recommended_action": f"Inspect {t['equipment_id']} against the finding, confirm the condition, and raise a work order for the repair or replacement it needs.",
            "confirmed_failure": confirmed,
            "out_of_service": out_of_service,
            "protection_layer_impaired": bool(t.get("protection_layer")) and not cosmetic and likelihood >= 7,
            "deviation_recorded": "no" if "no entry in the impairment register" in desc else "unknown",
            "evacuation_capacity_reduced": bool(t.get("evacuation")) and "unavailable" in desc,
            "uncertainty": "high" if "cannot see" in desc else ("medium" if "suspect" in desc else "low"),
        }

    def extract(self, request: ModelRequest) -> dict:
        from app.models.rules import draft_of
        from app.rules.template import fake_rules
        return draft_of(fake_rules(request.tags["equipments"], request.tags["domain_text"]))


def build_model(fake: bool, fake_delay: float = 0.0) -> ModelClient:
    return FakeModel(fake_delay) if fake else CachedModel(AnthropicModel())
