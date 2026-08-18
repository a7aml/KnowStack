"""Employee-facing invite acceptance, safety-net signup, and login.

Kept separate from controllers/auth_controller.py (admin signup/login) even
though the session-issuing mechanics are identical, since that file is
explicitly out of scope for this change — see _issue_session_for_user below,
which is a deliberate small duplication rather than an import of that
module's underscore-prefixed (module-private) helpers.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from supabase_auth.errors import AuthError

from config.settings import settings
from models import Invite, Organization, RefreshToken, User
from schemas.employee_schema import (
    AcceptInviteRequest,
    EmployeeLoginRequest,
    EmployeeSignupRequest,
    InviteValidateResponse,
)
from schemas.user_schema import UserPublic
from services.supabase_service import get_supabase_admin, get_supabase_anon
from utils.jwt_utils import create_access_token, create_refresh_token

logger = logging.getLogger(__name__)

GENERIC_LOGIN_ERROR = "Invalid email or password."
INVITE_INVALID_ERROR = "This invite is no longer valid, ask your admin to resend it."
NOT_INVITED_ERROR = "You need to be invited by your organization admin."


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
    jti = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    db.add(RefreshToken(user_id=user_id, jti=jti, expires_at=expires_at))
    return create_refresh_token(user_id=user_id, jti=jti)


def _issue_session_for_user(
    db: Session, user: User, organization: Organization | None
) -> tuple[UserPublic, str, str]:
    access_token = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role, email=user.email
    )
    refresh_token = _issue_refresh_token(db, user.id)
    db.commit()
    return _to_public(user, organization), access_token, refresh_token


def _expire_if_stale(db: Session, invite: Invite) -> None:
    if invite.status == "pending" and invite.expires_at <= datetime.now(timezone.utc):
        invite.status = "expired"
        db.commit()


def validate_invite_token(db: Session, token: str) -> InviteValidateResponse:
    invite = db.query(Invite).filter(Invite.token == token).first()
    if invite is None:
        return InviteValidateResponse(valid=False, reason="not_found")

    if invite.status == "accepted":
        return InviteValidateResponse(valid=False, reason="already_accepted")
    if invite.status == "revoked":
        return InviteValidateResponse(valid=False, reason="revoked")

    _expire_if_stale(db, invite)

    if invite.status != "pending":
        return InviteValidateResponse(valid=False, reason="expired")

    organization = db.get(Organization, invite.organization_id)
    return InviteValidateResponse(
        valid=True,
        email=invite.email,
        organization_name=organization.name if organization else None,
    )


def _accept_invite_core(db: Session, invite: Invite, *, password: str, full_name: str) -> str:
    """Re-validates the invite server-side and, if still eligible, creates
    the Supabase auth identity + users row for it. Returns the email of the
    newly created account. Shared by both the token-based accept flow and
    the email-based safety-net signup flow."""
    _expire_if_stale(db, invite)

    if invite.status == "accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This invite has already been accepted."
        )
    if invite.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVITE_INVALID_ERROR)

    email = invite.email

    # users.email is unique per organization (see models/user_model.py), not
    # globally, so this is scoped to the invite's own org — the same email
    # is allowed to already have an account in a different organization.
    existing_member = (
        db.query(User)
        .filter(User.email == email, User.organization_id == invite.organization_id)
        .first()
    )
    if existing_member is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    supabase_admin = get_supabase_admin()
    try:
        auth_result = supabase_admin.auth.admin.create_user(
            {"email": email, "password": password, "email_confirm": True}
        )
    except AuthError as exc:
        logger.warning("Supabase admin.create_user rejected invite accept for %s: %s", email, exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create account."
        ) from exc

    supabase_user_id = uuid.UUID(auth_result.user.id)

    try:
        user = User(
            id=supabase_user_id,
            organization_id=invite.organization_id,
            email=email,
            role="employee",
            full_name=full_name,
            invited_by=invite.invited_by,
            status="active",
        )
        db.add(user)
        invite.status = "accepted"
        invite.accepted_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        db.rollback()
        try:
            supabase_admin.auth.admin.delete_user(str(supabase_user_id))
        except Exception:
            logger.exception(
                "Failed to roll back orphaned Supabase auth user %s after invite-accept failure",
                supabase_user_id,
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create account.",
        )

    logger.info("Invite %s accepted — created employee %s", invite.id, user.id)
    return email


def accept_invite(db: Session, payload: AcceptInviteRequest) -> str:
    invite = db.query(Invite).filter(Invite.token == payload.token).first()
    if invite is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVITE_INVALID_ERROR)

    return _accept_invite_core(
        db, invite, password=payload.password, full_name=payload.full_name
    )


def employee_signup(db: Session, payload: EmployeeSignupRequest) -> str:
    """Safety net for /employees/signup being reached without an invite
    token in the URL: looks up the most recent pending/expired invite for
    this email (across any organization — the page has no org context) and
    only proceeds if one exists."""
    email = payload.email.lower()
    invite = (
        db.query(Invite)
        .filter(Invite.email == email, Invite.status.in_(("pending", "expired")))
        .order_by(Invite.created_at.desc())
        .first()
    )
    if invite is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_INVITED_ERROR)

    return _accept_invite_core(
        db, invite, password=payload.password, full_name=payload.full_name
    )


def employee_login(db: Session, payload: EmployeeLoginRequest) -> tuple[UserPublic, str, str]:
    supabase_anon = get_supabase_anon()
    try:
        supabase_anon.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except AuthError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or user.role != "employee":
        # Don't leak whether this email belongs to an admin account instead.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    if user.status == "invited":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Please accept your invite first."
        )
    if user.status == "disabled":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been disabled, contact your admin.",
        )
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is not active."
        )

    organization = db.get(Organization, user.organization_id)
    return _issue_session_for_user(db, user, organization)
