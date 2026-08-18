import re
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

PASSWORD_MIN_LENGTH = 8
NAME_MAX_LENGTH = 100


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str
    full_name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH)
    organization_name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH)

    @field_validator("full_name", "organization_name")
    @classmethod
    def not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        # Re-validated here even though the frontend checks this too — the
        # backend never trusts client-side validation.
        if len(value) < PASSWORD_MIN_LENGTH:
            raise ValueError(f"must be at least {PASSWORD_MIN_LENGTH} characters")
        if not re.search(r"[A-Z]", value):
            raise ValueError("must contain at least 1 uppercase letter")
        if not re.search(r"[0-9]", value):
            raise ValueError("must contain at least 1 number")
        if not re.search(r"[^A-Za-z0-9]", value):
            raise ValueError("must contain at least 1 special character")
        return value

    @model_validator(mode="after")
    def passwords_match(self) -> "SignupRequest":
        if self.password != self.confirm_password:
            raise ValueError("passwords do not match")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str | None
    role: str
    organization_id: uuid.UUID
    organization_name: str | None = None


class AuthResponse(BaseModel):
    user: UserPublic
    message: str


class OnboardingRequest(BaseModel):
    organization_name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH)
    # Deliberately a data: URL rather than a multipart file upload — this
    # project has no object-storage pipeline yet, so an optional logo is
    # stored directly in organizations.logo_url (a plain text column). Capped
    # well under Postgres's text limit to keep payloads reasonable for what's
    # meant to be a small logo image, not a general file upload.
    logo_url: str | None = Field(default=None, max_length=700_000)

    @field_validator("organization_name")
    @classmethod
    def not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("logo_url")
    @classmethod
    def logo_must_be_image_data_url(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not value.startswith("data:image/"):
            raise ValueError("logo must be an image data URL")
        return value


class OnboardingStatus(BaseModel):
    email: str
    needs_onboarding: bool
