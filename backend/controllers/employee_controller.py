"""Admin-only invite management: create/resend/revoke/list invites for the
admin's own organization. Employee-facing accept/login logic lives in
employee_auth_controller.py instead."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from middleware.auth_middleware import AuthContext
from models import Invite, Log, Organization, RefreshToken, User
from schemas.employee_schema import EmployeeUserPublic, InviteRequest
from services import invite_service
from services.email_service import send_invite_email

logger = logging.getLogger(__name__)

# Invites eligible to be silently reused (regenerate token/expiry) instead of
# creating a duplicate row for the same (organization, email) pair.
_RESENDABLE_STATUSES = ("pending", "expired")

# 'deleted' is a terminal state — reachable only through delete_user, never
# shown in the default users listing, never re-enterable via update_user_status.
DELETED_STATUS = "deleted"


def _paginate(query: Query, *, page: int, page_size: int) -> tuple[list, int]:
    """Generic offset pagination, shared by any org-scoped list endpoint in
    this controller that needs it (currently just list_users — list_invites
    doesn't paginate, so it doesn't call this)."""
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def _log_invite_action(db: Session, *, admin: AuthContext, action: str, invite: Invite) -> None:
    db.add(
        Log(
            organization_id=admin.organization_id,
            user_id=admin.user_id,
            action=action,
            metadata_={"invite_id": str(invite.id), "email": invite.email},
        )
    )


def _expire_stale_pending(db: Session, *, organization_id: uuid.UUID) -> None:
    """Lazily flips any pending invite past its expiry to 'expired' before it
    is shown to an admin, so the list/status always reflects reality even
    though nothing actively sweeps the table on a timer."""
    now = datetime.now(timezone.utc)
    db.query(Invite).filter(
        Invite.organization_id == organization_id,
        Invite.status == "pending",
        Invite.expires_at <= now,
    ).update({"status": "expired"}, synchronize_session=False)
    db.commit()


def list_invites(db: Session, admin: AuthContext) -> list[Invite]:
    _expire_stale_pending(db, organization_id=admin.organization_id)
    return (
        db.query(Invite)
        .filter(Invite.organization_id == admin.organization_id)
        .order_by(Invite.created_at.desc())
        .all()
    )


def _stage_send(db: Session, *, invite: Invite, organization: Organization) -> None:
    """Regenerates the invite's token/expiry, sends the email, and commits.
    Regenerating the token on the same row (rather than creating a new one)
    is what makes any previously-issued link for this invite stop working —
    it no longer matches any row's token."""
    invite.token = invite_service.generate_invite_token()
    invite.expires_at = invite_service.compute_expiry()
    invite.status = "pending"
    db.commit()

    try:
        send_invite_email(
            to_email=invite.email,
            organization_name=organization.name,
            invite_link=invite_service.build_invite_link(invite.token),
        )
    except RuntimeError as exc:
        # The invite row itself is already committed (status=pending, fresh
        # token) so the admin can retry via "resend" — only the email
        # delivery failed, not the invite creation.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invite was created, but the email failed to send. Try resending it.",
        ) from exc


def create_or_resend_invite(
    db: Session, admin: AuthContext, payload: InviteRequest
) -> tuple[Invite, bool]:
    """Returns (invite, is_resend)."""
    email = payload.email.lower()

    existing_active_member = (
        db.query(User)
        .filter(
            User.email == email,
            User.organization_id == admin.organization_id,
            User.status == "active",
        )
        .first()
    )
    if existing_active_member is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This person is already a member of your organization.",
        )

    organization = db.get(Organization, admin.organization_id)
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Organization not found."
        )

    existing_invite = (
        db.query(Invite)
        .filter(
            Invite.organization_id == admin.organization_id,
            Invite.email == email,
            Invite.status.in_(_RESENDABLE_STATUSES),
        )
        .order_by(Invite.created_at.desc())
        .first()
    )

    if existing_invite is not None:
        _stage_send(db, invite=existing_invite, organization=organization)
        _log_invite_action(db, admin=admin, action="invite_resent", invite=existing_invite)
        db.commit()
        logger.info("Invite resent for %s in org %s", email, admin.organization_id)
        return existing_invite, True

    invite = Invite(
        organization_id=admin.organization_id,
        email=email,
        invited_by=admin.user_id,
        token=invite_service.generate_invite_token(),
        status="pending",
        expires_at=invite_service.compute_expiry(),
    )
    db.add(invite)
    db.flush()

    try:
        send_invite_email(
            to_email=email,
            organization_name=organization.name,
            invite_link=invite_service.build_invite_link(invite.token),
        )
    except RuntimeError as exc:
        db.commit()  # keep the invite row so the admin can retry via resend
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invite was created, but the email failed to send. Try resending it.",
        ) from exc

    _log_invite_action(db, admin=admin, action="invite_created", invite=invite)
    db.commit()
    logger.info("Invite created for %s in org %s", email, admin.organization_id)
    return invite, False


def resend_invite(db: Session, admin: AuthContext, invite_id: uuid.UUID) -> Invite:
    invite = (
        db.query(Invite)
        .filter(Invite.id == invite_id, Invite.organization_id == admin.organization_id)
        .first()
    )
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")

    if invite.status not in _RESENDABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending or expired invites can be resent.",
        )

    organization = db.get(Organization, admin.organization_id)
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Organization not found."
        )

    _stage_send(db, invite=invite, organization=organization)
    _log_invite_action(db, admin=admin, action="invite_resent", invite=invite)
    db.commit()
    logger.info("Invite %s resent by %s", invite.id, admin.user_id)
    return invite


def revoke_invite(db: Session, admin: AuthContext, invite_id: uuid.UUID) -> Invite:
    invite = (
        db.query(Invite)
        .filter(Invite.id == invite_id, Invite.organization_id == admin.organization_id)
        .first()
    )
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")

    if invite.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending invites can be revoked."
        )

    invite.status = "revoked"
    _log_invite_action(db, admin=admin, action="invite_revoked", invite=invite)
    db.commit()
    logger.info("Invite %s revoked by %s", invite.id, admin.user_id)
    return invite


# --- Users Management (list/view/enable/disable/delete) ---------------------


def attach_inviter_names(db: Session, users: list[User]) -> dict[uuid.UUID, str | None]:
    """Batched lookup of inviter display names for a page of users, instead
    of one query per row."""
    inviter_ids = {u.invited_by for u in users if u.invited_by is not None}
    if not inviter_ids:
        return {}
    inviters = db.query(User).filter(User.id.in_(inviter_ids)).all()
    return {i.id: (i.full_name or i.email) for i in inviters}


def to_employee_public(
    user: User, inviter_names: dict[uuid.UUID, str | None]
) -> EmployeeUserPublic:
    return EmployeeUserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        invited_by=user.invited_by,
        invited_by_name=inviter_names.get(user.invited_by) if user.invited_by else None,
    )


def _apply_user_filters(query: Query, *, status_filter: str | None, search: str | None) -> Query:
    if status_filter:
        query = query.filter(User.status == status_filter)
    else:
        # Soft-deleted users are excluded from the default listing — callers
        # who want to see them must explicitly filter status='deleted'.
        query = query.filter(User.status != DELETED_STATUS)

    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))

    return query


def list_users(
    db: Session,
    admin: AuthContext,
    *,
    status_filter: str | None,
    search: str | None,
    page: int,
    page_size: int,
) -> tuple[list[User], int]:
    query = (
        db.query(User)
        .filter(User.organization_id == admin.organization_id)
        .order_by(User.created_at.desc())
    )
    query = _apply_user_filters(query, status_filter=status_filter, search=search)
    return _paginate(query, page=page, page_size=page_size)


def get_user(db: Session, admin: AuthContext, user_id: uuid.UUID) -> User:
    user = (
        db.query(User)
        .filter(User.id == user_id, User.organization_id == admin.organization_id)
        .first()
    )
    if user is None:
        # 404 (not 403) whether the id doesn't exist at all or belongs to a
        # different organization — an admin must never be able to tell the
        # two apart, or they could enumerate other orgs' user ids.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


def _assert_not_last_admin(
    db: Session, *, organization_id: uuid.UUID, excluding_user_id: uuid.UUID
) -> None:
    remaining_active_admins = (
        db.query(User)
        .filter(
            User.organization_id == organization_id,
            User.role == "admin",
            User.status == "active",
            User.id != excluding_user_id,
        )
        .count()
    )
    if remaining_active_admins == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization must have at least one active admin.",
        )


def _revoke_refresh_tokens(db: Session, user_id: uuid.UUID) -> None:
    """Same mechanism auth logout uses: mark every still-active refresh token
    revoked so an already-logged-in session can't keep renewing its access
    token past this point."""
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": datetime.now(timezone.utc)}, synchronize_session=False)


def _log_user_action(
    db: Session, *, admin: AuthContext, action: str, target: User, extra: dict | None = None
) -> None:
    metadata = {"target_user_id": str(target.id), "target_email": target.email}
    if extra:
        metadata.update(extra)
    db.add(
        Log(
            organization_id=admin.organization_id,
            user_id=admin.user_id,
            action=action,
            metadata_=metadata,
        )
    )


def update_user_status(
    db: Session, admin: AuthContext, user_id: uuid.UUID, new_status: str
) -> User:
    user = get_user(db, admin, user_id)

    if user.id == admin.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You cannot change your own account status."
        )

    if user.status == DELETED_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This user has been deleted and cannot be reactivated.",
        )

    if user.status == new_status:
        return user  # idempotent no-op

    if new_status == "disabled" and user.role == "admin":
        _assert_not_last_admin(
            db, organization_id=admin.organization_id, excluding_user_id=user.id
        )

    previous_status = user.status
    user.status = new_status
    if new_status == "disabled":
        _revoke_refresh_tokens(db, user.id)

    action = "user_enabled" if new_status == "active" else "user_disabled"
    _log_user_action(db, admin=admin, action=action, target=user, extra={"previous_status": previous_status})
    db.commit()
    logger.info("User %s status %s -> %s by %s", user.id, previous_status, new_status, admin.user_id)
    return user


def delete_user(db: Session, admin: AuthContext, user_id: uuid.UUID) -> User:
    """Soft delete: sets status='deleted' rather than removing the row, so
    chat_sessions/chat_messages/logs tied to this user (and the user record
    itself, for audit purposes) are preserved. See models/user_model.py for
    why 'deleted' is a distinct status from 'disabled'."""
    user = get_user(db, admin, user_id)

    if user.id == admin.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You cannot delete your own account."
        )

    if user.status == DELETED_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This user has already been deleted."
        )

    if user.role == "admin":
        _assert_not_last_admin(
            db, organization_id=admin.organization_id, excluding_user_id=user.id
        )

    previous_status = user.status
    user.status = DELETED_STATUS
    _revoke_refresh_tokens(db, user.id)

    _log_user_action(
        db, admin=admin, action="user_deleted", target=user, extra={"previous_status": previous_status}
    )
    db.commit()
    logger.info("User %s deleted by %s", user.id, admin.user_id)
    return user
