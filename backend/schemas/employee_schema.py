import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from schemas.user_schema import NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH


def _password_strength(value: str) -> str:
    # Re-validated here even though the frontend checks this too — the
    # backend never trusts client-side validation. Mirrors
    # schemas.user_schema.SignupRequest.password_strength.
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"must be at least {PASSWORD_MIN_LENGTH} characters")
    if not re.search(r"[A-Z]", value):
        raise ValueError("must contain at least 1 uppercase letter")
    if not re.search(r"[0-9]", value):
        raise ValueError("must contain at least 1 number")
    if not re.search(r"[^A-Za-z0-9]", value):
        raise ValueError("must contain at least 1 special character")
    return value


def _not_blank(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("must not be blank")
    return stripped


class InviteRequest(BaseModel):
    email: EmailStr


class InvitePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    status: str
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None


class InviteActionResponse(BaseModel):
    invite: InvitePublic
    message: str


class InviteListResponse(BaseModel):
    invites: list[InvitePublic]


class InviteValidateResponse(BaseModel):
    valid: bool
    email: str | None = None
    organization_name: str | None = None
    reason: str | None = None


class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    confirm_password: str
    full_name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH)

    @field_validator("full_name")
    @classmethod
    def not_blank(cls, value: str) -> str:
        return _not_blank(value)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _password_strength(value)

    @model_validator(mode="after")
    def passwords_match(self) -> "AcceptInviteRequest":
        if self.password != self.confirm_password:
            raise ValueError("passwords do not match")
        return self


class AcceptInviteResponse(BaseModel):
    email: str
    message: str


class EmployeeSignupRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str
    full_name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH)

    @field_validator("full_name")
    @classmethod
    def not_blank(cls, value: str) -> str:
        return _not_blank(value)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _password_strength(value)

    @model_validator(mode="after")
    def passwords_match(self) -> "EmployeeSignupRequest":
        if self.password != self.confirm_password:
            raise ValueError("passwords do not match")
        return self


class EmployeeLoginRequest(BaseModel):
    email: EmailStr
    password: str


# --- Users Management (list/view/enable/disable/delete) ---------------------


class EmployeeUserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str | None
    role: str
    status: str
    created_at: datetime
    invited_by: uuid.UUID | None
    invited_by_name: str | None = None


class EmployeeListResponse(BaseModel):
    users: list[EmployeeUserPublic]
    total: int
    page: int
    page_size: int


class UpdateUserStatusRequest(BaseModel):
    status: Literal["active", "disabled"]


class UserActionResponse(BaseModel):
    user: EmployeeUserPublic
    message: str
