"""Stage events. Every step reports what it did through one callable; the API
stores the rows and streams them to the screen while a job runs."""

from typing import Protocol


class Emitter(Protocol):
    def __call__(self, stage: str, status: str, title: str,
                 detail: dict | None = None, finding_id: str | None = None) -> None: ...


def silent(stage: str, status: str, title: str, detail: dict | None = None, finding_id: str | None = None) -> None:
    return None
