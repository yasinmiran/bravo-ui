"""The seven steps in order, for one batch, with a callback per finished finding."""

import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Callable

from app.llm import ModelClient
from app.models.inputs import Case
from app.models.rules import Rules
from app.models.ticket import Ticket
from app.pipeline.assess import assess
from app.pipeline.events import Emitter, silent
from app.pipeline.tickets import build_ticket


@dataclass
class Result:
    position: int
    case: Case
    ticket: Ticket
    trace: dict
    failed: bool


def run_triage(
        cases: list[Case],
        rules: Rules,
        model: ModelClient,
        model_name: str,
        workers: int,
        on_start: Callable[[Case], None] | None = None,
        on_done: Callable[[Result], None] | None = None,
        emit: Emitter = silent,
) -> list[Result]:
    def one(item: tuple[int, Case]) -> Result:
        position, case = item
        fid = case.finding.finding_id
        if on_start:
            on_start(case)
        emit("finding", "start", f"{fid} picked up", {"worker": threading.current_thread().name, "position": position}, fid)
        verdict = assess(model, model_name, case, rules, emit)
        ticket, trace = build_ticket(case, verdict, rules, position, model_name, emit)
        result = Result(position, case, ticket, trace, verdict.assessment is None)
        if on_done:
            on_done(result)
        return result

    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="worker") as pool:
        results = list(pool.map(one, enumerate(cases, start=1)))
    return results
