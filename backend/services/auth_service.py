"""Google OAuth helpers: PKCE parameter generation, the code-exchange call,
and the short-lived "authenticated but not yet onboarded" token used between
/auth/google/callback and /auth/onboarding/organization.

This token is deliberately NOT one of the access/refresh tokens minted by
utils/jwt_utils.py — those are tied to an organization_id (an access token)
or a refresh_tokens table row (a refresh token), neither of which exist yet
for a first-time Google user. It reuses the same signing secret (this
backend's JWT_SECRET_KEY) but is its own token `type`, so it can never be
mistaken for — or replayed as — a real access or refresh token.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from jwt import PyJWTError
from supabase_auth.types import User as SupabaseUser
from supabase_auth.errors import AuthError

from config.settings import settings
from services.supabase_service import exchange_google_oauth_code, get_google_authorize_url
from supabase_auth.helpers import generate_pkce_challenge, generate_pkce_verifier

ONBOARDING_TOKEN_TYPE = "onboarding"
ONBOARDING_TOKEN_EXPIRE_MINUTES = 30

# Short-lived, single-use: holds the PKCE verifier between the redirect to
# Google and the callback. Must be SameSite=Lax (not Strict, unlike the rest
# of this app's cookies) since it has to survive the top-level cross-site
# navigation back from Supabase/Google to our callback endpoint.
GOOGLE_OAUTH_VERIFIER_COOKIE = "google_oauth_verifier"
GOOGLE_OAUTH_VERIFIER_MAX_AGE_SECONDS = 10 * 60

# Scoped like the refresh token cookie (path="/auth"): only ever needed by
# the onboarding endpoints, never sent on ordinary API requests.
ONBOARDING_TOKEN_COOKIE = "onboarding_token"


class OnboardingTokenError(Exception):
    """Raised for any invalid, expired, or wrong-type onboarding token."""


class GoogleAuthError(Exception):
    """Raised when the Google/Supabase code exchange itself fails."""


def start_google_oauth(*, redirect_to: str) -> tuple[str, str]:
    """Returns (authorize_url, code_verifier). The verifier must be stashed
    by the caller in GOOGLE_OAUTH_VERIFIER_COOKIE and supplied back into
    complete_google_oauth on the callback."""
    code_verifier = generate_pkce_verifier()
    code_challenge = generate_pkce_challenge(code_verifier)
    authorize_url = get_google_authorize_url(redirect_to=redirect_to, code_challenge=code_challenge)
    return authorize_url, code_verifier


def complete_google_oauth(*, auth_code: str, code_verifier: str) -> SupabaseUser:
    """Exchanges the Google OAuth code for a Supabase identity. Returns only
    the Supabase auth user (id, email) — never creates or touches our own
    users/organizations tables; that's the caller's job, keyed off
    supabase_user.id (never email, so an account that later links Google to
    an existing email/password identity resolves to the same user)."""
    try:
        supabase_user = exchange_google_oauth_code(auth_code=auth_code, code_verifier=code_verifier)
    except AuthError as exc:
        raise GoogleAuthError(str(exc)) from exc

    if supabase_user is None:
        raise GoogleAuthError("Google sign-in did not return an authenticated user")

    return supabase_user


def create_onboarding_token(*, supabase_user_id: uuid.UUID, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(supabase_user_id),
        "email": email,
        "type": ONBOARDING_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(minutes=ONBOARDING_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_onboarding_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except PyJWTError as exc:
        raise OnboardingTokenError(str(exc)) from exc

    if payload.get("type") != ONBOARDING_TOKEN_TYPE:
        raise OnboardingTokenError("expected an onboarding token")

    return payload
