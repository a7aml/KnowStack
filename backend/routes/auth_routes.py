import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from config.database import get_db
from config.settings import settings
from controllers import auth_controller
from controllers.auth_controller import GoogleLoginOutcome
from middleware.auth_middleware import ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, AuthContext, get_current_user
from middleware.rate_limit_middleware import limiter, login_email_limiter
from schemas.user_schema import (
    AuthResponse,
    LoginRequest,
    OnboardingRequest,
    OnboardingStatus,
    SignupRequest,
    UserPublic,
)
from services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


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
        # Scoped to /auth: this cookie is only ever needed by /auth/refresh
        # and /auth/logout, so it's never sent on ordinary API requests.
        path="/auth",
    )


def _set_google_verifier_cookie(response: Response, code_verifier: str) -> None:
    response.set_cookie(
        key=auth_service.GOOGLE_OAUTH_VERIFIER_COOKIE,
        value=code_verifier,
        max_age=auth_service.GOOGLE_OAUTH_VERIFIER_MAX_AGE_SECONDS,
        httponly=True,
        secure=settings.cookie_secure,
        # Not "strict": this cookie must be sent when Google/Supabase
        # redirects the browser back to our callback — a top-level
        # navigation arriving FROM another site, which SameSite=Strict
        # cookies are never attached to. "Lax" still blocks it from being
        # sent on any cross-site subresource/XHR request, just not this
        # top-level GET redirect.
        samesite="lax",
        path="/auth/google",
    )


def _set_onboarding_cookie(response: Response, onboarding_token: str) -> None:
    response.set_cookie(
        key=auth_service.ONBOARDING_TOKEN_COOKIE,
        value=onboarding_token,
        max_age=auth_service.ONBOARDING_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/auth",
    )


def _get_onboarding_identity(request: Request) -> tuple[uuid.UUID, str]:
    """Dependency for the onboarding endpoints — the equivalent of
    get_current_user, but for the short-lived onboarding token rather than a
    real access token. Deliberately local to this router rather than in
    middleware/auth_middleware.py: it guards exactly two endpoints, both
    defined here, and the token type it verifies is specific to the Google
    onboarding handoff."""
    token = request.cookies.get(auth_service.ONBOARDING_TOKEN_COOKIE)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    try:
        payload = auth_service.decode_onboarding_token(token)
    except auth_service.OnboardingTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired onboarding session",
        )
    return uuid.UUID(payload["sub"]), payload["email"]


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/hour")
def signup(request: Request, payload: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = auth_controller.signup_admin(db, payload)
    # Do not auto-login after signup: the account is created, but the user
    # must explicitly log in afterward. No cookies are set on this response.
    return AuthResponse(user=user, message="Account created. Please log in.")


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/15minutes")
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> AuthResponse:
    login_email_limiter.check(
        f"login:{payload.email.lower()}", max_attempts=5, window_seconds=15 * 60
    )

    user, access_token, refresh_token = auth_controller.login(db, payload)
    _set_access_cookie(response, access_token)
    _set_refresh_cookie(response, refresh_token)
    return AuthResponse(user=user, message="Logged in.")


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("20/hour")
def refresh(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> AuthResponse:
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token."
        )

    # Rotation: refresh_access_token revokes the presented token and issues
    # a new one, so the cookie must be replaced with the new refresh token
    # here too, not just the access token.
    user, access_token, new_refresh_token = auth_controller.refresh_access_token(
        db, refresh_token
    )
    _set_access_cookie(response, access_token)
    _set_refresh_cookie(response, new_refresh_token)
    return AuthResponse(user=user, message="Session refreshed.")


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    auth_controller.logout(db, refresh_token)
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path="/auth")
    return {"message": "Logged out."}


@router.get("/me", response_model=UserPublic)
def me(
    current_user: AuthContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    return auth_controller.get_current_user_public(db, current_user.user_id)


# --- Google OAuth (admin only) -------------------------------------------
#
# Both endpoints below are reached via full browser navigation (the
# "Continue with Google" button is a plain link, and Supabase/Google redirect
# the browser directly here), not fetch/XHR — so unlike the JSON endpoints
# above, errors are reported as a redirect back to the login page with an
# error flag, never as a raw JSON error response the browser would render.


@router.get("/google/login")
@limiter.limit("10/15minutes")
def google_login(request: Request) -> RedirectResponse:
    callback_url = f"{str(request.base_url).rstrip('/')}/auth/google/callback"
    authorize_url, code_verifier = auth_service.start_google_oauth(redirect_to=callback_url)

    redirect = RedirectResponse(url=authorize_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    _set_google_verifier_cookie(redirect, code_verifier)
    return redirect


@router.get("/google/callback")
@limiter.limit("10/15minutes")
def google_callback(
    request: Request, db: Session = Depends(get_db)
) -> RedirectResponse:
    frontend = settings.frontend_origin.rstrip("/")
    code = request.query_params.get("code")
    provider_error = request.query_params.get("error")
    code_verifier = request.cookies.get(auth_service.GOOGLE_OAUTH_VERIFIER_COOKIE)

    def _error_redirect() -> RedirectResponse:
        redirect = RedirectResponse(
            url=f"{frontend}/admin/login?google_error=1", status_code=status.HTTP_302_FOUND
        )
        redirect.delete_cookie(auth_service.GOOGLE_OAUTH_VERIFIER_COOKIE, path="/auth/google")
        return redirect

    if provider_error or not code or not code_verifier:
        logger.warning(
            "Google OAuth callback missing code/verifier or reported provider error: %s",
            provider_error,
        )
        return _error_redirect()

    try:
        supabase_user = auth_service.complete_google_oauth(
            auth_code=code, code_verifier=code_verifier
        )
    except auth_service.GoogleAuthError:
        logger.warning("Google OAuth code exchange failed")
        return _error_redirect()

    outcome, user, access_token, refresh_token = auth_controller.login_with_google(
        db, supabase_user
    )

    if outcome is GoogleLoginOutcome.ACCOUNT_INACTIVE:
        logger.warning("Google sign-in blocked for disabled account (sub=%s)", supabase_user.id)
        return _error_redirect()

    if outcome is GoogleLoginOutcome.NEEDS_ONBOARDING:
        onboarding_token = auth_service.create_onboarding_token(
            supabase_user_id=uuid.UUID(supabase_user.id), email=supabase_user.email
        )
        logger.info("First-time Google user %s — redirecting to onboarding", supabase_user.id)
        redirect = RedirectResponse(
            url=f"{frontend}/admin/onboarding/organization", status_code=status.HTTP_302_FOUND
        )
        _set_onboarding_cookie(redirect, onboarding_token)
        redirect.delete_cookie(auth_service.GOOGLE_OAUTH_VERIFIER_COOKIE, path="/auth/google")
        return redirect

    # LOGGED_IN
    redirect = RedirectResponse(
        url=f"{frontend}/admin/dashboard", status_code=status.HTTP_302_FOUND
    )
    _set_access_cookie(redirect, access_token)
    _set_refresh_cookie(redirect, refresh_token)
    redirect.delete_cookie(auth_service.GOOGLE_OAUTH_VERIFIER_COOKIE, path="/auth/google")
    return redirect


@router.get("/onboarding/status", response_model=OnboardingStatus)
def onboarding_status(
    identity: tuple[uuid.UUID, str] = Depends(_get_onboarding_identity),
    db: Session = Depends(get_db),
) -> OnboardingStatus:
    supabase_user_id, email = identity
    needs_onboarding = not auth_controller.has_users_row(db, supabase_user_id)
    return OnboardingStatus(email=email, needs_onboarding=needs_onboarding)


@router.post("/onboarding/organization", response_model=AuthResponse)
@limiter.limit("3/hour")
def onboarding_organization(
    request: Request,
    response: Response,
    payload: OnboardingRequest,
    identity: tuple[uuid.UUID, str] = Depends(_get_onboarding_identity),
    db: Session = Depends(get_db),
) -> AuthResponse:
    supabase_user_id, email = identity

    user, access_token, refresh_token = auth_controller.complete_onboarding(
        db,
        supabase_user_id=supabase_user_id,
        email=email,
        organization_name=payload.organization_name,
        logo_url=payload.logo_url,
    )
    _set_access_cookie(response, access_token)
    _set_refresh_cookie(response, refresh_token)
    response.delete_cookie(auth_service.ONBOARDING_TOKEN_COOKIE, path="/auth")
    return AuthResponse(user=user, message="Organization created.")
