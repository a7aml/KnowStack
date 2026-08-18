import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from jwt import PyJWTError

from config.settings import settings

TokenType = Literal["access", "refresh"]


class TokenError(Exception):
    """Raised for any invalid, expired, or wrong-type token."""


def _create_token(
    *,
    subject: uuid.UUID,
    token_type: TokenType,
    expires_delta: timedelta,
    extra_claims: dict | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(
    *, user_id: uuid.UUID, organization_id: uuid.UUID, role: str, email: str
) -> str:
    return _create_token(
        subject=user_id,
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        extra_claims={
            "organization_id": str(organization_id),
            "role": role,
            "email": email,
        },
    )


def create_refresh_token(*, user_id: uuid.UUID, jti: str) -> str:
    # Deliberately minimal claims: organization_id/role are re-read from the
    # database on refresh so a role/status change takes effect immediately
    # instead of surviving until the stale refresh token expires. `jti`
    # identifies this token's row in the refresh_tokens table, which is what
    # makes rotation/revocation/reuse-detection possible.
    return _create_token(
        subject=user_id,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
        extra_claims={"jti": jti},
    )


def decode_token(token: str, *, expected_type: TokenType) -> dict:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except PyJWTError as exc:
        raise TokenError(str(exc)) from exc

    if payload.get("type") != expected_type:
        raise TokenError(f"expected a {expected_type!r} token")

    return payload
