"""add_deleted_status_to_users

Widens users.ck_users_status to allow 'deleted' as a distinct value from
'disabled', so the Users Management "delete" action (soft delete) can never
be confused with — or accidentally reversed via — the enable/disable toggle.

Note: the live constraint's actual name was found to be
'ck_users_ck_users_status' rather than the 'ck_users_status' every migration
file up to this point assumed (a pre-existing naming-convention doubling from
however the original migration was actually applied, unrelated to this
change). Rather than hardcode either name, the constraint to drop is looked
up dynamically by inspecting pg_constraint — the replacement constraint is
then created under the canonical 'ck_users_status' name, which also
incidentally corrects the drift for this one constraint going forward.

Revision ID: f3a9c6d81b02
Revises: b7e2a4f119dc
Create Date: 2026-08-17 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a9c6d81b02'
down_revision: Union[str, Sequence[str], None] = 'b7e2a4f119dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _find_status_check_constraint(bind) -> str:
    result = bind.execute(
        sa.text(
            """
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.users'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%status%'
            """
        )
    )
    names = [row[0] for row in result]
    if len(names) != 1:
        raise RuntimeError(
            f"Expected exactly one CHECK constraint on users.status, found: {names}"
        )
    return names[0]


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    constraint_name = _find_status_check_constraint(bind)
    # op.f(...) marks a name as already-final: without it, Alembic reruns
    # this project's "ck" naming-convention template
    # (ck_%(table_name)s_%(constraint_name)s) over whatever string is
    # passed, which is what produced 'ck_users_ck_users_status' in the
    # first place — passing the discovered name through unwrapped would
    # double it again (to 'ck_users_ck_users_ck_users_status').
    op.drop_constraint(op.f(constraint_name), 'users', type_='check')
    op.create_check_constraint(
        op.f('ck_users_status'), 'users', "status IN ('invited', 'active', 'disabled', 'deleted')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Narrowing the constraint back would reject any row already sitting at
    # 'deleted' — fail clearly here rather than let Postgres reject the DDL
    # with an opaque error, same approach as the other constraint migrations.
    bind = op.get_bind()
    deleted_count = bind.execute(sa.text("SELECT COUNT(*) FROM users WHERE status = 'deleted'")).scalar()
    if deleted_count:
        raise RuntimeError(
            f"Cannot downgrade — {deleted_count} user(s) have status='deleted', "
            "which the narrower constraint does not allow"
        )

    constraint_name = _find_status_check_constraint(bind)
    op.drop_constraint(op.f(constraint_name), 'users', type_='check')
    op.create_check_constraint(
        op.f('ck_users_status'), 'users', "status IN ('invited', 'active', 'disabled')"
    )
