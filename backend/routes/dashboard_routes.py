"""Admin-only dashboard endpoints: stats cards, activity chart, and the
activity log table. Read-only against existing Log/Document/ChatSession/
User/Invite data — does not touch chat/RAG, document ingestion, or
user/org-settings logic."""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from config.database import get_db
from controllers import dashboard_controller
from middleware.auth_middleware import AuthContext, require_admin
from schemas.dashboard_schema import (
    ActivityRange,
    ActivityResponse,
    DashboardStatsResponse,
    LogListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
def get_stats(
    admin: AuthContext = Depends(require_admin), db: Session = Depends(get_db)
) -> DashboardStatsResponse:
    return DashboardStatsResponse(stats=dashboard_controller.get_stats(db, admin))


@router.get("/activity", response_model=ActivityResponse)
def get_activity(
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
    # Named `range_` locally (query key stays `range`) to avoid shadowing
    # the `range` builtin in this module's scope.
    range_: ActivityRange = Query("7d", alias="range"),
) -> ActivityResponse:
    points = dashboard_controller.get_activity(db, admin, range_key=range_)
    return ActivityResponse(range=range_, points=points)


@router.get("/logs", response_model=LogListResponse)
def get_logs(
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: str | None = Query(None, max_length=100),
) -> LogListResponse:
    logs, total = dashboard_controller.get_logs(
        db, admin, page=page, page_size=page_size, action=action
    )
    return LogListResponse(logs=logs, total=total, page=page, page_size=page_size)
