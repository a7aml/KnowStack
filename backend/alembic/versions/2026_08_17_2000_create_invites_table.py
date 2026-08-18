"""create_invites_table

Revision ID: d4b6f18a92c3
Revises: c8420cf49871
Create Date: 2026-08-17 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4b6f18a92c3'
down_revision: Union[str, Sequence[str], None] = 'c8420cf49871'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'invites',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('invited_by', sa.UUID(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('status', sa.String(), server_default='pending', nullable=False),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('accepted_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'expired', 'revoked')", name='ck_invites_status'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_invites_organization_id_organizations'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invited_by'], ['users.id'], name=op.f('fk_invites_invited_by_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_invites')),
        sa.UniqueConstraint('token', name=op.f('uq_invites_token')),
    )
    op.create_index('ix_invites_organization_id', 'invites', ['organization_id'], unique=False)
    op.create_index('ix_invites_invited_by', 'invites', ['invited_by'], unique=False)
    op.create_index('ix_invites_email', 'invites', ['email'], unique=False)
    op.create_index('ix_invites_token', 'invites', ['token'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_invites_token', table_name='invites')
    op.drop_index('ix_invites_email', table_name='invites')
    op.drop_index('ix_invites_invited_by', table_name='invites')
    op.drop_index('ix_invites_organization_id', table_name='invites')
    op.drop_table('invites')
