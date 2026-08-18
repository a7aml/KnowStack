import logging
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from supabase_auth.errors import AuthError
from supabase_auth.types import User as SupabaseUser

from config.settings import settings
from models import Organization, RefreshToken, User
from schemas.user_schema import LoginRequest, SignupRequest, UserPublic
from services.supabase_service import get_supabase_admin, get_supabase_anon
from utils.jwt_utils import TokenError, create_access_token, create_refresh_token, decode_token

logger = logging.getLogger(__name__)

GENERIC_LOGIN_ERROR = "Invalid email or password."
INVALID_REFRESH_ERROR = "Invalid or expired refresh token."


class GoogleLoginOutcome(str, Enum):
    LOGGED_IN = "logged_in"
    NEEDS_ONBOARDING = "needs_onboarding"
    ACCOUNT_INACTIVE = "account_inactive"


def _to_public(user: User, organization: Organization | None) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        organization_id=user.organization_id,
        organization_name=organization.name if organization else None,
    )


def _issue_refresh_token(db: Session, user_id: uuid.UUID) -> str:
    """Stages a new refresh_tokens row (caller commits) and returns the
    signed JWT whose `jti` claim matches that row."""
    jti = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    db.add(RefreshToken(user_id=user_id, jti=jti, expires_at=expires_at))
    return create_refresh_token(user_id=user_id, jti=jti)


def _revoke_all_refresh_tokens(db: Session, user_id: uuid.UUID) -> None:
    """Reuse-detection response: a previously-rotated token was replayed,
    which is a signal of possible theft, so every outstanding refresh token
    for this user is revoked — forcing a fresh login everywhere."""
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()


def _issue_session_for_user(
    db: Session, user: User, organization: Organization | None
) -> tuple[UserPublic, str, str]:
    """Shared by every path that ends in 'this user is now logged in':
    email/password login, Google login, and completing onboarding. Mints
    access + refresh tokens exactly the same way regardless of which
    identity method got the caller here."""
    access_token = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role, email=user.email
    )
    refresh_token = _issue_refresh_token(db, user.id)
    db.commit()

    return _to_public(user, organization), access_token, refresh_token


def signup_admin(db: Session, payload: SignupRequest) -> UserPublic:
    email = payload.email.lower()

    if db.query(User).filter(User.email == email).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    supabase_admin = get_supabase_admin()
    try:
        auth_result = supabase_admin.auth.admin.create_user(
            {"email": email, "password": payload.password, "email_confirm": True}
        )
    except AuthError as exc:
        logger.warning("Supabase admin.create_user rejected signup for %s: %s", email, exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create account."
        ) from exc

    # public.users.id is kept identical to Supabase auth.users.id so that the
    # existing RLS policies (which key off auth.uid()) resolve correctly for
    # this user, even though the FastAPI backend itself queries via a direct
    # (RLS-bypassing) DB connection today.
    supabase_user_id = uuid.UUID(auth_result.user.id)

    try:
        organization = Organization(name=payload.organization_name)
        db.add(organization)
        db.flush()

        user = User(
            id=supabase_user_id,
            organization_id=organization.id,
            email=email,
            role="admin",
            full_name=payload.full_name,
            status="active",
        )
        db.add(user)
        db.commit()
    except Exception:
        db.rollback()
        try:
            supabase_admin.auth.admin.delete_user(str(supabase_user_id))
        except Exception:
            logger.exception(
                "Failed to roll back orphaned Supabase auth user %s after signup failure",
                supabase_user_id,
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create account.",
        )

    return _to_public(user, organization)


def login(db: Session, payload: LoginRequest) -> tuple[UserPublic, str, str]:
    supabase_anon = get_supabase_anon()
    try:
        supabase_anon.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except AuthError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None:
        # Supabase Auth accepted the password but there's no matching
        # public.users row — treat as invalid credentials rather than
        # leaking which side is out of sync.
        logger.error("Supabase Auth verified %s but no matching users row exists", payload.email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is not active."
        )

    organization = db.get(Organization, user.organization_id)
    return _issue_session_for_user(db, user, organization)


def refresh_access_token(db: Session, refresh_token: str) -> tuple[UserPublic, str, str]:
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
    except TokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_REFRESH_ERROR
        )

    user_id = uuid.UUID(payload["sub"])
    jti = payload.get("jti")

    token_row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first() if jti else None
    if token_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_REFRESH_ERROR
        )

    if token_row.revoked_at is not None:
        # This exact token was already used once (rotated away) or already
        # revoked, and is now being presented again — treat as a stolen
        # token and kill every session this user has.
        logger.warning(
            "Refresh token reuse detected for user %s (jti=%s) — revoking all sessions",
            user_id,
            jti,
        )
        _revoke_all_refresh_tokens(db, user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_REFRESH_ERROR
        )

    if token_row.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_REFRESH_ERROR
        )

    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_REFRESH_ERROR
        )

    # Rotate: the token just presented is now spent, and a new one replaces
    # it. Any later replay of the old token hits the reuse-detection branch
    # above.
    token_row.revoked_at = datetime.now(timezone.utc)

    organization = db.get(Organization, user.organization_id)
    access_token = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role, email=user.email
    )
    new_refresh_token = _issue_refresh_token(db, user.id)
    db.commit()

    return _to_public(user, organization), access_token, new_refresh_token


def logout(db: Session, refresh_token: str | None) -> None:
    """Revokes the refresh token server-side. Best-effort: an already
    invalid/expired/missing token just means there's nothing to revoke —
    logout still succeeds either way, since the cookies get cleared
    regardless."""
    if not refresh_token:
        return

    try:
        payload = decode_token(refresh_token, expected_type="refresh")
    except TokenError:
        return

    jti = payload.get("jti")
    if not jti:
        return

    db.query(RefreshToken).filter(
        RefreshToken.jti == jti, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()


def get_current_user_public(db: Session, user_id: uuid.UUID) -> UserPublic:
    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session"
        )
    organization = db.get(Organization, user.organization_id)
    return _to_public(user, organization)


def has_users_row(db: Session, supabase_user_id: uuid.UUID) -> bool:
    """Used by the onboarding-status check: true once a Google user has a
    real users row (whether from completing onboarding or, e.g., an admin
    provisioning them some other way)."""
    return db.get(User, supabase_user_id) is not None


def login_with_google(
    db: Session, supabase_user: SupabaseUser
) -> tuple[GoogleLoginOutcome, UserPublic | None, str | None, str | None]:
    """Resolves an already-Google-authenticated Supabase identity against our
    own users table, keyed strictly by supabase_user.id (never email) so a
    Google identity later linked to an existing email/password account by
    Supabase resolves to that same account rather than a duplicate.

    This never raises — /auth/google/callback is a browser-redirect target,
    not a JSON API, so every outcome (including "account disabled") is
    reported back as data for the caller to turn into the right redirect,
    instead of an HTTPException the browser would render as a raw error.
    """
    supabase_user_id = uuid.UUID(supabase_user.id)
    user = db.get(User, supabase_user_id)

    if user is None:
        return GoogleLoginOutcome.NEEDS_ONBOARDING, None, None, None

    if user.status != "active":
        return GoogleLoginOutcome.ACCOUNT_INACTIVE, None, None, None

    organization = db.get(Organization, user.organization_id)
    user_public, access_token, refresh_token = _issue_session_for_user(db, user, organization)
    logger.info("Google sign-in for existing user %s", user.id)
    return GoogleLoginOutcome.LOGGED_IN, user_public, access_token, refresh_token


def complete_onboarding(
    db: Session,
    *,
    supabase_user_id: uuid.UUID,
    email: str,
    organization_name: str,
    logo_url: str | None,
) -> tuple[UserPublic, str, str]:
    """Creates the organizations + users row for a first-time Google admin
    and logs them in, exactly like signup_admin does for the email/password
    flow — except role is always hardcoded to 'admin' here too, and there is
    no client-supplied value anywhere in this path that could override it.

    Double-submission safe: if a users row for this supabase_user_id already
    exists — because this is a sequential double-click (checked up front) or
    a genuine concurrent race (caught via the unique/primary-key violation
    on insert) — no second organization/user is created; the caller is just
    logged into the existing account instead.
    """
    existing_user = db.get(User, supabase_user_id)
    if existing_user is not None:
        organization = db.get(Organization, existing_user.organization_id)
        logger.info("Onboarding no-op for already-onboarded user %s", supabase_user_id)
        return _issue_session_for_user(db, existing_user, organization)

    try:
        organization = Organization(name=organization_name, logo_url=logo_url)
        db.add(organization)
        db.flush()

        user = User(
            id=supabase_user_id,
            organization_id=organization.id,
            email=email.lower(),
            role="admin",
            full_name=None,
            status="active",
        )
        db.add(user)
        db.flush()
    except IntegrityError:
        # Lost a race with a concurrent request onboarding the same
        # supabase_user_id (e.g. a double-submit from two tabs). The other
        # request's insert won; treat this one as a normal login instead of
        # erroring out.
        db.rollback()
        user = db.get(User, supabase_user_id)
        if user is None:
            # Shouldn't happen — the constraint violation implies a row
            # exists — but don't silently swallow it if it somehow does.
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not complete onboarding.",
            )
        organization = db.get(Organization, user.organization_id)
        logger.info("Onboarding race resolved for user %s — logging in instead", supabase_user_id)
        return _issue_session_for_user(db, user, organization)

    logger.info("Onboarding complete: organization %s created by user %s", organization.id, user.id)
    return _issue_session_for_user(db, user, organization)
