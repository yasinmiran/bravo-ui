"""One shared passphrase in front of the API. A demo gate, not an identity system."""

import hmac

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Login(BaseModel):
    passphrase: str


def accepted(value: str | None) -> bool:
    return value is not None and hmac.compare_digest(value.encode(), settings.passphrase.encode())


def require_passphrase(x_passphrase: str | None = Header(default=None)) -> None:
    if not accepted(x_passphrase):
        raise HTTPException(401, "passphrase required")


def require_passphrase_or_key(x_passphrase: str | None = Header(default=None), key: str | None = Query(default=None)) -> None:
    """EventSource cannot set headers, so the stream also takes the passphrase as ?key=."""
    if not (accepted(x_passphrase) or accepted(key)):
        raise HTTPException(401, "passphrase required")


@router.post("/login", status_code=204)
def login(body: Login):
    if not accepted(body.passphrase):
        raise HTTPException(401, "that passphrase is not right")
