"""Admin-only organization settings endpoints."""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from config.database import get_db
from controllers import organization_controller
from middleware.auth_middleware import AuthContext, require_admin
from middleware.rate_limit_middleware import InMemoryWindowLimiter, limiter
from schemas.organization_schema import (
    OrganizationActionResponse,
    OrganizationPublic,
    UpdateOrganizationRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organization", tags=["organization"])

# Same InMemoryWindowLimiter pattern as employee_routes.py's per-org invite
# and user-management limits — separate bucket for this endpoint.
_organization_update_limiter = InMemoryWindowLimiter()


@router.get("", response_model=OrganizationPublic)
def get_organization(
    admin: AuthContext = Depends(require_admin), db: Session = Depends(get_db)
) -> OrganizationPublic:
    organization = organization_controller.get_organization(db, admin)
    return OrganizationPublic.model_validate(organization)


@router.patch("", response_model=OrganizationActionResponse)
@limiter.limit("20/hour")
def update_organization(
    request: Request,
    payload: UpdateOrganizationRequest,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> OrganizationActionResponse:
    _organization_update_limiter.check(
        f"org_update:{admin.organization_id}", max_attempts=20, window_seconds=60 * 60
    )
    organization = organization_controller.update_organization(db, admin, payload)
    return OrganizationActionResponse(
        organization=OrganizationPublic.model_validate(organization),
        message="Organization updated.",
    )
