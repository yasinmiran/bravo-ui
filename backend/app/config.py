"""Process settings, read once from the environment and an optional .env file."""

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
SEED_DIR = Path(__file__).resolve().parent / "seed"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        if line.strip() and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


@dataclass(frozen=True)
class Settings:
    assess_model: str
    extract_model: str
    workers: int
    fake_model: bool
    fake_delay: float
    passphrase: str
    db_path: Path

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(BACKEND_DIR / ".env")
        db = Path(os.environ.get("TRIAGE_DB", "triage.db"))
        return cls(
            assess_model=os.environ.get("TRIAGE_ASSESS_MODEL", "claude-sonnet-5-5"),
            extract_model=os.environ.get("TRIAGE_EXTRACT_MODEL", "claude-opus-5-5"),
            workers=max(1, int(os.environ.get("TRIAGE_WORKERS", "4"))),
            fake_model=os.environ.get("TRIAGE_FAKE_MODEL", "0") == "1",
            fake_delay=max(0.0, float(os.environ.get("TRIAGE_FAKE_DELAY", "1.2"))),
            passphrase=os.environ.get("TRIAGE_PASSPHRASE", "XYZ123321!"),
            db_path=db if db.is_absolute() else BACKEND_DIR / db,
        )


settings = Settings.from_env()
