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
    frontend_origin: str = "http://localhost:3000"

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

    @property
    def cookie_secure(self) -> bool:
        # Secure cookies are dropped by browsers over plain HTTP, which is
        # what local `next dev` / `uvicorn` use. Require HTTPS (Secure=True)
        # everywhere except local development.
        return self.environment != "development"

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
