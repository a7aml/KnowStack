"""Admin-only invite management: create/resend/revoke/list invites. Employee
-facing accept/login/signup endpoints live in employee_auth_routes.py."""

import logging
import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from config.database import get_db
from controllers import employee_controller
from middleware.auth_middleware import AuthContext, require_admin
from middleware.rate_limit_middleware import InMemoryWindowLimiter, limiter
from schemas.employee_schema import (
    EmployeeListResponse,
    EmployeeUserPublic,
    InviteActionResponse,
    InviteListResponse,
    InvitePublic,
    InviteRequest,
    UpdateUserStatusRequest,
    UserActionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/employees", tags=["employees"])

# Per-org limit on top of the per-IP @limiter.limit decorators below — an
# admin hammering the invite endpoint from one IP for one org shouldn't be
# able to spam a mailbox just because slowapi's IP-based limit is generous
# enough to allow it. Same InMemoryWindowLimiter class auth_routes.py uses
# for per-email login attempts.
_invite_action_limiter = InMemoryWindowLimiter()

# Same pattern, separate bucket: enable/disable/delete are a different kind
# of action from sending invite emails and shouldn't share one budget.
_user_management_limiter = InMemoryWindowLimiter()


@router.post("/invite", response_model=InviteActionResponse, status_code=201)
@limiter.limit("30/hour")
def invite_employee(
    request: Request,
    payload: InviteRequest,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> InviteActionResponse:
    _invite_action_limiter.check(
        f"invite:{admin.organization_id}", max_attempts=20, window_seconds=60 * 60
    )
    invite, is_resend = employee_controller.create_or_resend_invite(db, admin, payload)
    message = "Invite resent." if is_resend else "Invite sent."
    return InviteActionResponse(invite=InvitePublic.model_validate(invite), message=message)


@router.get("/invites", response_model=InviteListResponse)
def list_invites(
    admin: AuthContext = Depends(require_admin), db: Session = Depends(get_db)
) -> InviteListResponse:
    invites = employee_controller.list_invites(db, admin)
    return InviteListResponse(invites=[InvitePublic.model_validate(i) for i in invites])


@router.post("/invites/{invite_id}/resend", response_model=InviteActionResponse)
@limiter.limit("30/hour")
def resend_invite(
    request: Request,
    invite_id: uuid.UUID,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> InviteActionResponse:
    _invite_action_limiter.check(
        f"invite:{admin.organization_id}", max_attempts=20, window_seconds=60 * 60
    )
    invite = employee_controller.resend_invite(db, admin, invite_id)
    return InviteActionResponse(invite=InvitePublic.model_validate(invite), message="Invite resent.")


@router.post("/invites/{invite_id}/revoke", response_model=InviteActionResponse)
def revoke_invite(
    invite_id: uuid.UUID,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> InviteActionResponse:
    invite = employee_controller.revoke_invite(db, admin, invite_id)
    return InviteActionResponse(invite=InvitePublic.model_validate(invite), message="Invite revoked.")


# --- Users Management ---------------------------------------------------
#
# These are registered after /invite and /invites/... on purpose: FastAPI
# (Starlette) matches routes in registration order, and "/employees/{user_id}"
# below is structurally ambiguous with "/employees/invites" (both are a
# single dynamic-looking path segment) — if the wildcard route were
# registered first, a request to /employees/invites would match it before
# ever reaching the real /employees/invites route, and fail UUID parsing on
# the literal string "invites". Keep any new static /employees/<literal>
# route above this section, and any new dynamic /employees/{...} route below
# it.


@router.get("", response_model=EmployeeListResponse)
def list_users(
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
    status: str | None = Query(None, pattern="^(active|disabled|invited|deleted)$"),
    search: str | None = Query(None, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> EmployeeListResponse:
    users, total = employee_controller.list_users(
        db, admin, status_filter=status, search=search, page=page, page_size=page_size
    )
    inviter_names = employee_controller.attach_inviter_names(db, users)
    return EmployeeListResponse(
        users=[employee_controller.to_employee_public(u, inviter_names) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}", response_model=EmployeeUserPublic)
def get_user(
    user_id: uuid.UUID,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> EmployeeUserPublic:
    user = employee_controller.get_user(db, admin, user_id)
    inviter_names = employee_controller.attach_inviter_names(db, [user])
    return employee_controller.to_employee_public(user, inviter_names)


@router.patch("/{user_id}/status", response_model=UserActionResponse)
@limiter.limit("30/hour")
def update_user_status(
    request: Request,
    user_id: uuid.UUID,
    payload: UpdateUserStatusRequest,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserActionResponse:
    _user_management_limiter.check(
        f"user_status:{admin.organization_id}", max_attempts=30, window_seconds=60 * 60
    )
    user = employee_controller.update_user_status(db, admin, user_id, payload.status)
    inviter_names = employee_controller.attach_inviter_names(db, [user])
    message = "User enabled." if payload.status == "active" else "User disabled."
    return UserActionResponse(
        user=employee_controller.to_employee_public(user, inviter_names), message=message
    )


@router.delete("/{user_id}", response_model=UserActionResponse)
@limiter.limit("20/hour")
def delete_user(
    request: Request,
    user_id: uuid.UUID,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserActionResponse:
    _user_management_limiter.check(
        f"user_delete:{admin.organization_id}", max_attempts=20, window_seconds=60 * 60
    )
    user = employee_controller.delete_user(db, admin, user_id)
    inviter_names = employee_controller.attach_inviter_names(db, [user])
    return UserActionResponse(
        user=employee_controller.to_employee_public(user, inviter_names), message="User deleted."
    )
