import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, CheckConstraint, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'employee')", name="ck_users_role"),
        # 'deleted' is a distinct terminal state from 'disabled' (soft
        # delete for the Users Management "delete" action) — kept separate
        # so a deleted account can never be resurrected via the same
        # enable/disable toggle used for 'disabled'.
        CheckConstraint(
            "status IN ('invited', 'active', 'disabled', 'deleted')", name="ck_users_status"
        ),
        # Email is unique per organization, not globally — the same person
        # (email) can be a member of more than one organization, each as its
        # own distinct users row.
        UniqueConstraint("organization_id", "email", name="uq_users_organization_id_email"),
        Index("ix_users_organization_id", "organization_id"),
        Index("ix_users_invited_by", "invited_by"),
        Index("ix_users_email", "email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="invited")
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
