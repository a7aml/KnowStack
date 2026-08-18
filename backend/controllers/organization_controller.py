"""Admin-only organization settings: view and update the requester's own
organization. organization_id always comes from the AuthContext (JWT claims),
never from client input — there is no id parameter anywhere in these
endpoints, so an admin can only ever act on their own organization."""

import logging

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from middleware.auth_middleware import AuthContext
from models import Log, Organization
from schemas.organization_schema import UpdateOrganizationRequest

logger = logging.getLogger(__name__)


def get_organization(db: Session, admin: AuthContext) -> Organization:
    organization = db.get(Organization, admin.organization_id)
    if organization is None:
        # Shouldn't happen — every user row's organization_id is a valid FK
        # — but don't silently paper over data corruption if it somehow did.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Organization not found."
        )
    return organization


def update_organization(
    db: Session, admin: AuthContext, payload: UpdateOrganizationRequest
) -> Organization:
    organization = get_organization(db, admin)
    fields_set = payload.model_fields_set

    changed_fields: list[str] = []
    new_name: str | None = None

    if "name" in fields_set and payload.name is not None and payload.name != organization.name:
        new_name = payload.name
        organization.name = payload.name
        changed_fields.append("name")

    if "logo_url" in fields_set and payload.logo_url != organization.logo_url:
        organization.logo_url = payload.logo_url
        changed_fields.append("logo_url")

    if not changed_fields:
        return organization  # idempotent no-op — nothing actually changed

    metadata: dict = {"changed_fields": changed_fields}
    if new_name is not None:
        metadata["new_name"] = new_name
    # Deliberately never logging logo_url itself — it's a base64 data URL up
    # to ~700KB, far too large (and not useful) for an audit log entry.

    db.add(
        Log(
            organization_id=admin.organization_id,
            user_id=admin.user_id,
            action="organization_updated",
            metadata_=metadata,
        )
    )
    db.commit()
    logger.info(
        "Organization %s updated by %s: %s", organization.id, admin.user_id, changed_fields
    )
    return organization
