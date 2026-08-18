"""fix_users_email_unique_constraint

Replaces the global unique(email) index on users with a composite
unique(organization_id, email) constraint, so the same email can belong to a
user in more than one organization. A plain (non-unique) index on email is
kept, since existing lookups (e.g. login) still query by email alone.

Revision ID: b7e2a4f119dc
Revises: d4b6f18a92c3
Create Date: 2026-08-17 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2a4f119dc'
down_revision: Union[str, Sequence[str], None] = 'd4b6f18a92c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _assert_no_duplicate_emails_per_org(message: str) -> None:
    """Refuses to proceed if any (organization_id, email) pair is not
    unique — creating the composite unique index over such data would fail
    with an opaque Postgres error, so this fails fast with a clear one and
    without ever attempting the DDL against bad data."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            """
            SELECT organization_id, email, COUNT(*) AS row_count
            FROM users
            GROUP BY organization_id, email
            HAVING COUNT(*) > 1
            """
        )
    )
    duplicates = result.fetchall()
    if duplicates:
        details = ", ".join(
            f"(organization_id={row.organization_id}, email={row.email}, count={row.row_count})"
            for row in duplicates
        )
        raise RuntimeError(f"{message}: {details}")


def upgrade() -> None:
    """Upgrade schema."""
    _assert_no_duplicate_emails_per_org(
        "Cannot add uq_users_organization_id_email — duplicate (organization_id, email) rows exist"
    )

    op.drop_index('ix_users_email', table_name='users')
    op.create_index('ix_users_email', 'users', ['email'], unique=False)
    op.create_unique_constraint(
        op.f('uq_users_organization_id_email'), 'users', ['organization_id', 'email']
    )


def downgrade() -> None:
    """Downgrade schema."""
    # A global unique(email) can only be restored if no email is currently
    # shared across organizations — otherwise recreating it would fail.
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            """
            SELECT email, COUNT(*) AS row_count
            FROM users
            GROUP BY email
            HAVING COUNT(*) > 1
            """
        )
    )
    duplicates = result.fetchall()
    if duplicates:
        details = ", ".join(f"(email={row.email}, count={row.row_count})" for row in duplicates)
        raise RuntimeError(
            f"Cannot restore global unique(email) — email(s) shared across organizations exist: {details}"
        )

    op.drop_constraint(op.f('uq_users_organization_id_email'), 'users', type_='unique')
    op.drop_index('ix_users_email', table_name='users')
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
