"""add_logs_organization_created_at_index

Adds a composite index on logs(organization_id, created_at). The existing
ix_logs_organization_id index covers simple org-scoped lookups, but the new
dashboard endpoints (backend/services/dashboard_service.py) add two query
patterns that benefit from created_at being part of the index: a
GROUP BY day() over a date range for the activity chart, and an
ORDER BY created_at DESC ... LIMIT/OFFSET for the paginated activity log
table — both filtered by organization_id first.

Revision ID: b2d0f4a6e8c1
Revises: a1c9e3f4d5b6
Create Date: 2026-08-20 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b2d0f4a6e8c1'
down_revision: Union[str, Sequence[str], None] = 'a1c9e3f4d5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        "ix_logs_organization_id_created_at", "logs", ["organization_id", "created_at"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_logs_organization_id_created_at", table_name="logs")
