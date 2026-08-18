"""Invite token generation and expiry logic — kept separate from
employee_controller/employee_auth_controller so the "how long does an invite
live" and "how is a token generated" policy lives in one place."""

import secrets
from datetime import datetime, timedelta, timezone

from config.settings import settings

# secrets.token_urlsafe(32) -> 43 base64url chars from 32 bytes of entropy,
# cryptographically unguessable (uses os.urandom under the hood).
INVITE_TOKEN_BYTES = 32
INVITE_EXPIRY_DAYS = 3


def generate_invite_token() -> str:
    return secrets.token_urlsafe(INVITE_TOKEN_BYTES)


def compute_expiry(*, now: datetime | None = None) -> datetime:
    base = now or datetime.now(timezone.utc)
    return base + timedelta(days=INVITE_EXPIRY_DAYS)


def build_invite_link(token: str) -> str:
    frontend = settings.frontend_origin.rstrip("/")
    return f"{frontend}/accept-invite?token={token}"
