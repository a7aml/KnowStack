"""create_initial_tables

Revision ID: 59e86db208ff
Revises:
Create Date: 2026-08-16 22:07:31.830595

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = '59e86db208ff'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Matches OpenAI text-embedding-3-small (1536 dims). Update if the embedding model changes.
EMBEDDING_DIM = 1536


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("logo_url", sa.String(), nullable=True),
        sa.Column("plan", sa.String(), nullable=False, server_default="free"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "organization_id",
            postgresql.UUID(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column(
            "invited_by",
            postgresql.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="invited"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("role IN ('admin', 'employee')", name="ck_users_role"),
        sa.CheckConstraint("status IN ('invited', 'active', 'disabled')", name="ck_users_status"),
    )

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "organization_id",
            postgresql.UUID(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by",
            postgresql.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'ready', 'failed')", name="ck_documents_status"
        ),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "organization_id",
            postgresql.UUID(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            postgresql.UUID(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        # NOTE: No ANN index (hnsw/ivfflat) on this column yet — add one
        # (e.g. `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`)
        # once there is real data to tune lists/m/ef_construction against.
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "organization_id",
            postgresql.UUID(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "session_id",
            postgresql.UUID(),
            sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("role IN ('user', 'assistant', 'system')", name="ck_chat_messages_role"),
    )

    op.create_table(
        "logs",
        sa.Column("id", postgresql.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "organization_id",
            postgresql.UUID(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # --- Indexes ---
    op.create_index("ix_users_organization_id", "users", ["organization_id"])
    op.create_index("ix_users_invited_by", "users", ["invited_by"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_index("ix_documents_organization_id", "documents", ["organization_id"])
    op.create_index("ix_documents_uploaded_by", "documents", ["uploaded_by"])
    op.create_index("ix_documents_organization_id_status", "documents", ["organization_id", "status"])

    op.create_index("ix_document_chunks_organization_id", "document_chunks", ["organization_id"])
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.create_index(
        "ix_document_chunks_organization_id_document_id",
        "document_chunks",
        ["organization_id", "document_id"],
    )

    op.create_index("ix_chat_sessions_organization_id", "chat_sessions", ["organization_id"])
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])

    op.create_index("ix_chat_messages_organization_id", "chat_messages", ["organization_id"])
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])

    op.create_index("ix_logs_organization_id", "logs", ["organization_id"])
    op.create_index("ix_logs_user_id", "logs", ["user_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("logs")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("users")
    op.drop_table("organizations")
