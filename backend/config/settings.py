from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# Secrets that must never be accepted outside development, even if they
# happen to be long enough — catches "someone copy-pasted the old default"
# as well as other obviously-not-actually-secret values.
_INSECURE_JWT_SECRET_PLACEHOLDERS = {
    "dev-only-insecure-secret-change-me",
    "changeme",
    "change-me",
    "secret",
    "your-secret-key",
    "your-jwt-secret",
}
_MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    # No default on purpose (see jwt_secret_key below for the same
    # reasoning): CORS (main.py) and every redirect/callback URL built from
    # this (Google OAuth callback, invite links) key off it directly. A
    # silent "http://localhost:3000" fallback would mean a deployment that
    # forgot to set FRONTEND_ORIGIN doesn't fail to start — it starts fine
    # and then silently rejects every request from the real frontend with a
    # CORS error that gives no hint the env var is the cause.
    frontend_origin: str

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    database_url: str = ""

    openai_api_key: str = ""

    # --- Transactional email (employee invites) ---
    # Empty by default: email_service treats a missing key as "email sending
    # is not configured" and logs instead of raising, so local dev/tests
    # don't need a real Resend account just to exercise the invite flow.
    resend_api_key: str = ""
    resend_from_email: str = ""

    # --- Auth (JWT issued by this backend, stored in httpOnly cookies) ---
    # Supabase Auth is used only to create/verify user credentials; session
    # tokens are our own, so RLS-facing claims (organization_id, role) stay
    # under this backend's control.
    #
    # No default value here on purpose: a missing JWT_SECRET_KEY must fail
    # app startup (pydantic raises if a required field has no env value)
    # rather than silently signing tokens with a guessable fallback.
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # --- Redis / Celery (background task infrastructure) ---
    # Local dev: `docker-compose up redis` starts Redis at this default URL.
    # The same instance is used as both the Celery broker and result
    # backend — fine at this scale; split them if that ever becomes a
    # bottleneck. See backend/celery_app.py for how this is consumed, and
    # backend/tasks/example_task.py for a placeholder task that proves the
    # pipeline works end to end.
    redis_url: str = "redis://localhost:6379/0"

    # Per-task queue routing (e.g. sending document-processing tasks to
    # their own queue) and per-task retry policies belong here once real
    # tasks exist — e.g.:
    #   celery_task_routes: dict[str, dict] = {"tasks.documents.*": {"queue": "documents"}}
    #   celery_default_retry_delay: int = 60
    #   celery_max_retries: int = 3
    # Left as a comment for now: there are no real tasks yet, so there's
    # nothing to route or set a retry policy for.

    @property
    def cookie_secure(self) -> bool:
        # Always True. Every cookie is now SameSite=None (frontend and
        # backend are deployed on different sites — Vercel + Railway — and
        # SameSite=Lax/Strict cookies are never attached to cross-site
        # fetch/XHR requests, regardless of CORS config). Browsers silently
        # *reject* a SameSite=None cookie unless Secure is also set, so this
        # can no longer vary by environment the way it used to.
        #
        # This doesn't break local dev: Chrome/Firefox/Safari all treat
        # http://localhost as a "potentially trustworthy" secure context and
        # still set/send Secure cookies on it without TLS. It would break on
        # a plain-HTTP *non-localhost* host (e.g. a LAN IP), but that isn't
        # a supported local dev setup here.
        return True

    @model_validator(mode="after")
    def _require_strong_jwt_secret_outside_development(self) -> "Settings":
        if self.environment == "development":
            return self
        if len(self.jwt_secret_key) < _MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET_KEY must be at least {_MIN_JWT_SECRET_LENGTH} characters "
                f"when ENVIRONMENT != 'development'"
            )
        if self.jwt_secret_key.strip().lower() in _INSECURE_JWT_SECRET_PLACEHOLDERS:
            raise ValueError(
                "JWT_SECRET_KEY is set to a known placeholder value — generate a real secret"
            )
        return self


settings = Settings()
