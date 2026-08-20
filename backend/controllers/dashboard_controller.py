"""Admin-only dashboard aggregation: stats cards, activity chart data, and
the activity log table. Everything here is read-only against existing
Log/Document/ChatSession/User/Invite data — no writes, and nothing here
touches chat/RAG, document ingestion, or user/org-settings logic."""

from sqlalchemy.orm import Session

from middleware.auth_middleware import AuthContext
from models import User
from schemas.dashboard_schema import ActivityPoint, DashboardStats, DocumentStatusCounts, LogEntryPublic
from services import dashboard_service


def get_stats(db: Session, admin: AuthContext) -> DashboardStats:
    org_id = admin.organization_id
    document_counts = dashboard_service.get_document_status_counts(db, org_id)
    return DashboardStats(
        team_members=dashboard_service.get_team_member_count(db, org_id),
        pending_invites=dashboard_service.get_pending_invite_count(db, org_id),
        documents=DocumentStatusCounts(**document_counts),
        chat_sessions=dashboard_service.get_chat_session_count(db, org_id),
    )


def get_activity(db: Session, admin: AuthContext, *, range_key: str) -> list[ActivityPoint]:
    points = dashboard_service.get_daily_activity(db, admin.organization_id, range_key=range_key)
    return [ActivityPoint(date=day, count=count) for day, count in points]


def _actor_name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name or user.email


def get_logs(
    db: Session, admin: AuthContext, *, page: int, page_size: int, action: str | None
) -> tuple[list[LogEntryPublic], int]:
    rows, total = dashboard_service.get_logs(
        db, admin.organization_id, page=page, page_size=page_size, action=action
    )
    logs = [
        LogEntryPublic(
            id=log.id,
            action=log.action,
            actor_id=log.user_id,
            actor_name=_actor_name(user),
            metadata=log.metadata_,
            created_at=log.created_at,
        )
        for log, user in rows
    ]
    return logs, total
