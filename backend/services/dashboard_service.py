"""Dashboard aggregation queries: stats cards, daily activity counts, and
paginated log entries. Everything here is read-only and scoped by
organization_id off the caller's AuthContext — never trust client input for
that. Counts and group-by-day aggregation are done in SQL (COUNT/GROUP BY),
not pulled into Python and counted manually; the only Python-side work is
zero-filling days with no activity so the chart's x-axis is continuous."""

import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import ChatSession, Document, Invite, Log, User

ACTIVITY_RANGE_DAYS: dict[str, int] = {"7d": 7, "30d": 30, "90d": 90}

# Mirrors documents.ck_documents_status — kept as a local constant rather
# than imported so this module doesn't need to know about
# models/document_model.py's internals beyond the column it queries.
_DOCUMENT_STATUSES = ("pending", "processing", "ready", "failed")


def get_team_member_count(db: Session, organization_id: uuid.UUID) -> int:
    return (
        db.query(func.count(User.id))
        .filter(User.organization_id == organization_id, User.status == "active")
        .scalar()
    )


def get_pending_invite_count(db: Session, organization_id: uuid.UUID) -> int:
    # Matches what an admin sees as "pending" on the Users page: a status of
    # 'pending' whose expiry hasn't actually passed yet. (The Users page
    # additionally flips stale rows to 'expired' as a side effect of
    # loading; this is a pure read, so it filters the same rows out instead
    # of relying on that write having already happened.)
    now = datetime.now(timezone.utc)
    return (
        db.query(func.count(Invite.id))
        .filter(
            Invite.organization_id == organization_id,
            Invite.status == "pending",
            Invite.expires_at > now,
        )
        .scalar()
    )


def get_document_status_counts(db: Session, organization_id: uuid.UUID) -> dict[str, int]:
    rows = (
        db.query(Document.status, func.count(Document.id))
        .filter(Document.organization_id == organization_id)
        .group_by(Document.status)
        .all()
    )
    counts = {status: 0 for status in _DOCUMENT_STATUSES}
    for status, count in rows:
        if status in counts:
            counts[status] = count
    counts["total"] = sum(counts[s] for s in _DOCUMENT_STATUSES)
    return counts


def get_chat_session_count(db: Session, organization_id: uuid.UUID) -> int:
    # Org-wide total across every user (admin + employees) — a plain count,
    # not a listing, so this doesn't expose any individual employee's
    # session content or violate the chat feature's per-user privacy.
    return (
        db.query(func.count(ChatSession.id))
        .filter(ChatSession.organization_id == organization_id)
        .scalar()
    )


def get_daily_activity(
    db: Session, organization_id: uuid.UUID, *, range_key: str
) -> list[tuple[date, int]]:
    """Zero-filled daily counts of logged actions for the given range,
    oldest first."""
    days = ACTIVITY_RANGE_DAYS[range_key]
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=days - 1)
    since = datetime.combine(start_date, time.min, tzinfo=timezone.utc)

    day_col = func.date_trunc("day", Log.created_at).label("day")
    rows = (
        db.query(day_col, func.count(Log.id))
        .filter(Log.organization_id == organization_id, Log.created_at >= since)
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )
    counts_by_day = {row_day.date(): count for row_day, count in rows}

    return [
        (day, counts_by_day.get(day, 0))
        for day in (start_date + timedelta(days=offset) for offset in range(days))
    ]


def get_logs(
    db: Session,
    organization_id: uuid.UUID,
    *,
    page: int,
    page_size: int,
    action: str | None = None,
) -> tuple[list[tuple[Log, User | None]], int]:
    """Returns (rows, total) where each row pairs a Log with the User who
    performed it (None if the actor's account was later deleted — user_id
    is ON DELETE SET NULL). One outer-joined query rather than a separate
    lookup per row."""
    query = (
        db.query(Log, User)
        .outerjoin(User, User.id == Log.user_id)
        .filter(Log.organization_id == organization_id)
    )
    if action:
        query = query.filter(Log.action == action)

    total = query.count()
    rows = (
        query.order_by(Log.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return rows, total
