import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

NAME_MAX_LENGTH = 100

# Mirrors schemas/user_schema.py's OnboardingRequest.logo_url validation
# (same "data:image/" prefix check, same length cap) — duplicated here
# rather than imported since user_schema.py is out of scope for this
# change and its validators are bound to that specific model. Keep both in
# sync if this limit or rule ever changes.
MAX_LOGO_DATA_URL_LENGTH = 700_000


def _not_blank(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("must not be blank")
    return stripped


def _validate_logo_data_url(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not value.startswith("data:image/"):
        raise ValueError("logo must be an image data URL")
    return value


class OrganizationPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    logo_url: str | None
    created_at: datetime


class UpdateOrganizationRequest(BaseModel):
    # Both optional — this is a partial update (name and/or logo). Which
    # fields were actually provided (vs. simply defaulted to None) is read
    # via `model_fields_set` in the controller, not by checking for None,
    # so omitting a field truly means "leave it unchanged".
    name: str | None = Field(default=None, max_length=NAME_MAX_LENGTH)
    logo_url: str | None = Field(default=None, max_length=MAX_LOGO_DATA_URL_LENGTH)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _not_blank(value)

    @field_validator("logo_url")
    @classmethod
    def logo_must_be_image_data_url(cls, value: str | None) -> str | None:
        return _validate_logo_data_url(value)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UpdateOrganizationRequest":
        if not ({"name", "logo_url"} & self.model_fields_set):
            raise ValueError("must provide at least a name or a logo to update")
        return self


class OrganizationActionResponse(BaseModel):
    organization: OrganizationPublic
    message: str
