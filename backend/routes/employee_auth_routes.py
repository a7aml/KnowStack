"""Employee-facing endpoints: validate/accept an invite, the direct-signup
safety net, and employee login. Admin-only invite management lives in
employee_routes.py instead."""

import logging

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from config.database import get_db
from config.settings import settings
from controllers import employee_auth_controller
from middleware.auth_middleware import ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE
from middleware.rate_limit_middleware import InMemoryWindowLimiter, limiter
from schemas.employee_schema import (
    AcceptInviteRequest,
    AcceptInviteResponse,
    EmployeeLoginRequest,
    EmployeeSignupRequest,
    InviteValidateResponse,
)
from schemas.user_schema import AuthResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/employees", tags=["employee-auth"])

# Same shape as auth_routes.py's login_email_limiter — kept as a separate
# instance here since this file only imports the class, not that module's
# shared instance, to stay within the auth-routes-are-out-of-scope boundary.
_employee_login_email_limiter = InMemoryWindowLimiter()
_accept_invite_limiter = InMemoryWindowLimiter()


def _set_access_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/auth",
    )


@router.get("/invite/validate", response_model=InviteValidateResponse)
@limiter.limit("30/hour")
def validate_invite(request: Request, token: str, db: Session = Depends(get_db)) -> InviteValidateResponse:
    return employee_auth_controller.validate_invite_token(db, token)


@router.post("/invite/accept", response_model=AcceptInviteResponse, status_code=201)
@limiter.limit("10/hour")
def accept_invite(
    request: Request, payload: AcceptInviteRequest, db: Session = Depends(get_db)
) -> AcceptInviteResponse:
    _accept_invite_limiter.check(
        f"accept:{payload.token}", max_attempts=10, window_seconds=60 * 60
    )
    email = employee_auth_controller.accept_invite(db, payload)
    # Do not auto-login: the account is created, but the employee must
    # explicitly log in afterward, consistent with the admin signup flow.
    return AcceptInviteResponse(email=email, message="Account created. Please log in.")


@router.post("/signup", response_model=AcceptInviteResponse, status_code=201)
@limiter.limit("5/hour")
def employee_signup(
    request: Request, payload: EmployeeSignupRequest, db: Session = Depends(get_db)
) -> AcceptInviteResponse:
    email = employee_auth_controller.employee_signup(db, payload)
    return AcceptInviteResponse(email=email, message="Account created. Please log in.")


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/15minutes")
def employee_login(
    request: Request,
    response: Response,
    payload: EmployeeLoginRequest,
    db: Session = Depends(get_db),
) -> AuthResponse:
    _employee_login_email_limiter.check(
        f"employee_login:{payload.email.lower()}", max_attempts=5, window_seconds=15 * 60
    )

    user, access_token, refresh_token = employee_auth_controller.employee_login(db, payload)
    _set_access_cookie(response, access_token)
    _set_refresh_cookie(response, refresh_token)
    return AuthResponse(user=user, message="Logged in.")
