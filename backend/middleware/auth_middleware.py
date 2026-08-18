import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status

from utils.jwt_utils import TokenError, decode_token

ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"


@dataclass(frozen=True)
class AuthContext:
    user_id: uuid.UUID
    organization_id: uuid.UUID
    role: str
    email: str


def get_current_user(request: Request) -> AuthContext:
    """FastAPI dependency: reads the access token from the httpOnly cookie
    (never from headers), verifies its signature/expiry, and attaches the
    resolved identity to request.state for downstream handlers.

    Raises 401 on anything invalid or expired — the frontend is expected to
    call POST /auth/refresh and retry when it sees a 401.
    """
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    try:
        payload = decode_token(token, expected_type="access")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        ) from exc

    context = AuthContext(
        user_id=uuid.UUID(payload["sub"]),
        organization_id=uuid.UUID(payload["organization_id"]),
        role=payload["role"],
        email=payload["email"],
    )

    request.state.user_id = context.user_id
    request.state.organization_id = context.organization_id
    request.state.role = context.role

    return context


def require_admin(user: AuthContext = Depends(get_current_user)) -> AuthContext:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return user
