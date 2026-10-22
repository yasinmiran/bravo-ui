import os
import threading
from pathlib import Path

import pytest

os.environ["TRIAGE_FAKE_MODEL"] = "1"
os.environ["TRIAGE_FAKE_DELAY"] = "0"
os.environ["TRIAGE_DB"] = str(Path(__file__).parent / ".test.db")

from app.config import settings  # noqa: E402  settings read the environment above

PASSPHRASE = {"X-Passphrase": settings.passphrase}


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    """One database file per test, and the next test waits for this test's job threads.
    Recycling one file is unsafe: a job thread that outlives its test reopens the WAL
    shared-memory file by name and truncates it under the live mapping (SIGBUS)."""
    from app import db
    object.__setattr__(settings, "db_path", tmp_path / "test.db")
    db.init()
    yield
    for thread in threading.enumerate():
        if thread is not threading.main_thread() and thread.daemon:
            thread.join(timeout=30)
