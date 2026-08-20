import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

ActivityRange = Literal["7d", "30d", "90d"]


class DocumentStatusCounts(BaseModel):
    ready: int
    processing: int
    failed: int
    pending: int
    total: int


class DashboardStats(BaseModel):
    team_members: int
    pending_invites: int
    documents: DocumentStatusCounts
    chat_sessions: int


class DashboardStatsResponse(BaseModel):
    stats: DashboardStats


class ActivityPoint(BaseModel):
    date: date
    count: int


class ActivityResponse(BaseModel):
    range: ActivityRange
    points: list[ActivityPoint]


class LogEntryPublic(BaseModel):
    id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None
    actor_name: str | None
    # Passed through as-is from Log.metadata_ (JSONB) — already carries
    # whatever contextual "target" info the action recorded (e.g.
    # target_email, document_id/file_name, invite_id) without this schema
    # needing to know the shape of every action type.
    metadata: dict | None
    created_at: datetime


class LogListResponse(BaseModel):
    logs: list[LogEntryPublic]
    total: int
    page: int
    page_size: int
