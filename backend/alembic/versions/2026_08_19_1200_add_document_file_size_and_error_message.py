"""add_document_file_size_and_error_message

Adds documents.file_size (bytes, needed by the Documents tab list view) and
documents.error_message (nullable, populated by the ingestion task when
processing fails so an admin can see why without digging through worker
logs).

Revision ID: a1c9e3f4d5b6
Revises: f3a9c6d81b02
Create Date: 2026-08-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c9e3f4d5b6'
down_revision: Union[str, Sequence[str], None] = 'f3a9c6d81b02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable + backfilled rather than NOT NULL from the start: any existing
    # rows (there shouldn't be real ones yet, but nothing enforces that) have
    # no way to know their historical file size.
    op.add_column("documents", sa.Column("file_size", sa.Integer(), nullable=True))
    op.execute("UPDATE documents SET file_size = 0 WHERE file_size IS NULL")
    op.alter_column("documents", "file_size", nullable=False, server_default="0")

    op.add_column("documents", sa.Column("error_message", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("documents", "error_message")
    op.drop_column("documents", "file_size")
