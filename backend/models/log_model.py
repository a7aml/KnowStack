import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class Log(Base):
    __tablename__ = "logs"
    __table_args__ = (
        Index("ix_logs_organization_id", "organization_id"),
        Index("ix_logs_user_id", "user_id"),
        # Backs the dashboard's daily-activity GROUP BY and the paginated
        # activity log's ORDER BY created_at DESC, both always filtered by
        # organization_id first. See dashboard_service.py.
        Index("ix_logs_organization_id_created_at", "organization_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String, nullable=False)
    # Mapped as `metadata_` in Python because `metadata` is reserved by SQLAlchemy's Base.
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
