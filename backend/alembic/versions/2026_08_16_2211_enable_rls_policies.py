"""enable_rls_policies

Revision ID: fae972eca8b2
Revises: 59e86db208ff
Create Date: 2026-08-16 22:11:08.550828

Assumption this migration depends on (not itself created here — that's Auth
Hook / signup-flow configuration, out of scope for a DB migration):
Supabase Auth is configured (via a Custom Access Token Hook, or by promoting
`raw_app_meta_data` claims) so that every issued JWT carries top-level
`organization_id` and `role` ('admin' | 'employee') claims, readable in SQL
as `auth.jwt() ->> 'organization_id'` / `auth.jwt() ->> 'role'`. Every policy
below relies on those two claims being present and trustworthy.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fae972eca8b2'
down_revision: Union[str, Sequence[str], None] = '59e86db208ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # --- organizations -----------------------------------------------------
    # Special case: this table has no organization_id column of its own —
    # a row's PRIMARY KEY *is* the organization identifier.
    op.execute("""
        ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

        -- Members can see only their own organization's row.
        CREATE POLICY organizations_select_own
            ON organizations
            FOR SELECT
            USING (id = (auth.jwt() ->> 'organization_id')::uuid);

        -- Only an admin of the organization may update its row
        -- (e.g. name, logo, plan).
        CREATE POLICY organizations_update_admin
            ON organizations
            FOR UPDATE
            USING (
                id = (auth.jwt() ->> 'organization_id')::uuid
                AND (auth.jwt() ->> 'role') = 'admin'
            )
            WITH CHECK (
                id = (auth.jwt() ->> 'organization_id')::uuid
                AND (auth.jwt() ->> 'role') = 'admin'
            );

        -- No INSERT policy: a brand-new organization has no existing member
        -- whose JWT could satisfy any of these checks (chicken-and-egg at
        -- signup time), so organization creation is intentionally left to
        -- the backend's service_role connection, which bypasses RLS
        -- entirely.
        -- No DELETE policy: organization deletion is a destructive,
        -- tenant-wide operation intentionally left out of the client-facing
        -- policy surface — service_role only.
    """)

    # --- users ---------------------------------------------------------
    op.execute("""
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;

        -- A user can see every user in their own organization, and can
        -- always see their own row regardless of role.
        CREATE POLICY users_select_own_org_or_self
            ON users
            FOR SELECT
            USING (
                organization_id = (auth.jwt() ->> 'organization_id')::uuid
                OR id = auth.uid()
            );

        -- Only an admin may create a user, and only within their own
        -- organization.
        CREATE POLICY users_insert_admin
            ON users
            FOR INSERT
            WITH CHECK (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            );

        -- Only an admin may update a user, and only within their own
        -- organization.
        CREATE POLICY users_update_admin
            ON users
            FOR UPDATE
            USING (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            )
            WITH CHECK (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            );

        -- Only an admin may delete a user, and only within their own
        -- organization.
        CREATE POLICY users_delete_admin
            ON users
            FOR DELETE
            USING (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            );
    """)

    # --- documents -----------------------------------------------------
    op.execute("""
        ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

        -- Both admins and employees can read any document in their own
        -- organization.
        CREATE POLICY documents_select_org
            ON documents
            FOR SELECT
            USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

        -- Only an admin may create a document record, within their own
        -- organization.
        CREATE POLICY documents_insert_admin
            ON documents
            FOR INSERT
            WITH CHECK (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            );

        -- Only an admin may update a document record, within their own
        -- organization.
        CREATE POLICY documents_update_admin
            ON documents
            FOR UPDATE
            USING (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            )
            WITH CHECK (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            );

        -- Only an admin may delete a document, within their own
        -- organization.
        CREATE POLICY documents_delete_admin
            ON documents
            FOR DELETE
            USING (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            );
    """)

    # --- document_chunks -------------------------------------------------
    op.execute("""
        ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

        -- Both admins and employees can read chunks belonging to their own
        -- organization — this is what powers RAG retrieval for the chat
        -- feature.
        CREATE POLICY document_chunks_select_org
            ON document_chunks
            FOR SELECT
            USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

        -- Deliberately no INSERT/UPDATE/DELETE policy: chunking and
        -- embedding is a backend-only pipeline. Regular authenticated users
        -- (admin or employee) must never write directly to this table. In
        -- Supabase, the service_role connection bypasses RLS entirely, so
        -- the backend can still write here using that role even with zero
        -- write policies defined for `authenticated`.
    """)

    # --- chat_sessions ---------------------------------------------------
    op.execute("""
        ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

        -- DECISION POINT (flagged per task instructions, not assumed): a
        -- user may only see/create their OWN chat sessions. Admins do NOT
        -- get visibility into other employees' chat history under this
        -- policy, even within the same organization. If admin oversight or
        -- audit of employee conversations is required later, that should be
        -- added as an explicit, separate admin-scoped policy rather than
        -- loosening this one.
        CREATE POLICY chat_sessions_select_own
            ON chat_sessions
            FOR SELECT
            USING (
                organization_id = (auth.jwt() ->> 'organization_id')::uuid
                AND user_id = auth.uid()
            );

        CREATE POLICY chat_sessions_insert_own
            ON chat_sessions
            FOR INSERT
            WITH CHECK (
                organization_id = (auth.jwt() ->> 'organization_id')::uuid
                AND user_id = auth.uid()
            );

        -- No UPDATE/DELETE policy: chat sessions are treated as append-only
        -- from the client's perspective for this step; editing/removing
        -- history is left to the backend service_role until a product
        -- decision is made.
    """)

    # --- chat_messages ---------------------------------------------------
    op.execute("""
        ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

        -- Same decision as chat_sessions: only the owning user can
        -- read/write their own messages. Ownership is resolved via the
        -- parent chat_sessions row since chat_messages itself only stores
        -- session_id + organization_id, not user_id directly.
        CREATE POLICY chat_messages_select_own
            ON chat_messages
            FOR SELECT
            USING (
                organization_id = (auth.jwt() ->> 'organization_id')::uuid
                AND EXISTS (
                    SELECT 1 FROM chat_sessions cs
                    WHERE cs.id = chat_messages.session_id
                      AND cs.user_id = auth.uid()
                )
            );

        CREATE POLICY chat_messages_insert_own
            ON chat_messages
            FOR INSERT
            WITH CHECK (
                organization_id = (auth.jwt() ->> 'organization_id')::uuid
                AND EXISTS (
                    SELECT 1 FROM chat_sessions cs
                    WHERE cs.id = chat_messages.session_id
                      AND cs.user_id = auth.uid()
                )
            );

        -- No UPDATE/DELETE policy, same rationale as chat_sessions.
    """)

    # --- logs ------------------------------------------------------------
    op.execute("""
        ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

        -- Only admins can read the audit log, and only for their own
        -- organization.
        CREATE POLICY logs_select_admin
            ON logs
            FOR SELECT
            USING (
                (auth.jwt() ->> 'role') = 'admin'
                AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
            );

        -- Deliberately no INSERT/UPDATE/DELETE policy: log rows must only
        -- ever be written by the backend itself (service_role bypasses
        -- RLS), so the audit trail can't be forged or tampered with by an
        -- admin or employee acting through the regular authenticated API
        -- surface.
    """)


def downgrade() -> None:
    """Downgrade schema."""

    op.execute("""
        DROP POLICY IF EXISTS logs_select_admin ON logs;
        ALTER TABLE logs DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS chat_messages_select_own ON chat_messages;
        DROP POLICY IF EXISTS chat_messages_insert_own ON chat_messages;
        ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS chat_sessions_select_own ON chat_sessions;
        DROP POLICY IF EXISTS chat_sessions_insert_own ON chat_sessions;
        ALTER TABLE chat_sessions DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS document_chunks_select_org ON document_chunks;
        ALTER TABLE document_chunks DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS documents_select_org ON documents;
        DROP POLICY IF EXISTS documents_insert_admin ON documents;
        DROP POLICY IF EXISTS documents_update_admin ON documents;
        DROP POLICY IF EXISTS documents_delete_admin ON documents;
        ALTER TABLE documents DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS users_select_own_org_or_self ON users;
        DROP POLICY IF EXISTS users_insert_admin ON users;
        DROP POLICY IF EXISTS users_update_admin ON users;
        DROP POLICY IF EXISTS users_delete_admin ON users;
        ALTER TABLE users DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS organizations_select_own ON organizations;
        DROP POLICY IF EXISTS organizations_update_admin ON organizations;
        ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
    """)
