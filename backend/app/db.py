"""SQLite access. One connection per call, writes serialised by a process lock."""

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from app.config import settings

_write_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  UNIQUE(workspace_id, kind)
);
CREATE TABLE IF NOT EXISTS assets (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  service_description TEXT NOT NULL,
  criticality_score INTEGER NOT NULL,
  reliability_score INTEGER NOT NULL,
  safety_critical_element INTEGER NOT NULL,
  redundancy TEXT NOT NULL,
  engineer_comment TEXT NOT NULL,
  position INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, equipment_id)
);
CREATE TABLE IF NOT EXISTS rules_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  yaml TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, version)
);
CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rules_version_id TEXT NOT NULL REFERENCES rules_versions(id),
  number INTEGER NOT NULL,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '{}',
  input TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  finding_id TEXT NOT NULL,
  equipment_id TEXT NOT NULL,
  ticket TEXT NOT NULL,
  trace TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  decision_note TEXT,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  finding_id TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_by_job ON events(job_id, id);
CREATE TABLE IF NOT EXISTS model_cache (
  key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  usage TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def now_ms() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def init(path: Path | None = None) -> None:
    target = path or settings.db_path
    target.parent.mkdir(parents=True, exist_ok=True)
    with connect(target) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def connect(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(path or settings.db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def write() -> Iterator[sqlite3.Connection]:
    with _write_lock, connect() as conn:
        yield conn


def one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> dict[str, Any] | None:
    row = conn.execute(sql, params).fetchone()
    return dict(row) if row else None


def all_rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads(text: str | None, default: Any = None) -> Any:
    return json.loads(text) if text else default
