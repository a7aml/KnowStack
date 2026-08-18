import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class Invite(Base):
    __tablename__ = "invites"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'expired', 'revoked')", name="ck_invites_status"
        ),
        Index("ix_invites_organization_id", "organization_id"),
        Index("ix_invites_invited_by", "invited_by"),
        Index("ix_invites_email", "email"),
        Index("ix_invites_token", "token", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String, nullable=False)
    invited_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    accepted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
