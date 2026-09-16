"""One-off: seeds 3 fully-isolated organizations (1 admin + 2 employees each)
directly in Supabase Auth + Postgres, for manual multi-tenant-isolation QA.

Deliberately bypasses the HTTP invite/signup flow — it calls the same two
primitives controllers/auth_controller.py's signup_admin and
controllers/employee_auth_controller.py's _accept_invite_core use under the
hood (Supabase admin.create_user for the auth identity, then a
public.users row with the *same* id), just without an Invite row or any
email being sent.

Idempotent-ish: refuses to run if any of the 9 target emails already have a
public.users row, so re-running after a partial/failed attempt won't create
duplicates silently. On any failure partway through, it rolls back the DB
transaction and deletes any Supabase auth users it had already created in
this run, so it doesn't leave orphaned auth identities behind.

Run from backend/ with the venv active:
    python scripts/seed_qa_tenants.py
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from supabase_auth.errors import AuthError  # noqa: E402

from config.database import SessionLocal  # noqa: E402
from models import Organization, User  # noqa: E402
from services.supabase_service import get_supabase_admin  # noqa: E402

ORGS = [
    {
        "name": "Org One",
        "admin_email": "testadmin1@gmail.com",
        "admin_password": "Org1Admin#2026",
        "employees": [
            ("testadmin1+emp1@gmail.com", "Org1Emp1#2026"),
            ("testadmin1+emp2@gmail.com", "Org1Emp2#2026"),
        ],
    },
    {
        "name": "Org Two",
        "admin_email": "testadmin2@gmail.com",
        "admin_password": "Org2Admin#2026",
        "employees": [
            ("testadmin2+emp1@gmail.com", "Org2Emp1#2026"),
            ("testadmin2+emp2@gmail.com", "Org2Emp2#2026"),
        ],
    },
    {
        "name": "Org Three",
        "admin_email": "testadmin3@gmail.com",
        "admin_password": "Org3Admin#2026",
        "employees": [
            ("testadmin3+emp1@gmail.com", "Org3Emp1#2026"),
            ("testadmin3+emp2@gmail.com", "Org3Emp2#2026"),
        ],
    },
]


def all_target_emails() -> list[str]:
    emails = []
    for org in ORGS:
        emails.append(org["admin_email"])
        emails.extend(email for email, _ in org["employees"])
    return emails


def create_auth_user(supabase_admin, email: str, password: str) -> uuid.UUID:
    result = supabase_admin.auth.admin.create_user(
        {"email": email, "password": password, "email_confirm": True}
    )
    return uuid.UUID(result.user.id)


def delete_auth_user(supabase_admin, user_id: uuid.UUID) -> None:
    try:
        supabase_admin.auth.admin.delete_user(str(user_id))
    except Exception as exc:  # noqa: BLE001
        print(f"  WARNING: failed to roll back Supabase auth user {user_id}: {exc}")


def main() -> int:
    supabase_admin = get_supabase_admin()
    db = SessionLocal()

    # Pre-flight: refuse to touch anything if any target email is already a
    # real member somewhere, so this script is safe to re-run after a
    # failed attempt without piling up duplicates.
    existing = db.query(User.email).filter(User.email.in_(all_target_emails())).all()
    if existing:
        print("ABORTING: these emails already have a users row — clean them up first:")
        for (email,) in existing:
            print(f"  - {email}")
        db.close()
        return 1

    created_auth_ids: list[uuid.UUID] = []

    try:
        for org_spec in ORGS:
            print(f"\n=== {org_spec['name']} ===")

            organization = Organization(name=org_spec["name"])
            db.add(organization)
            db.flush()
            print(f"  organization_id: {organization.id}")

            admin_id = create_auth_user(
                supabase_admin, org_spec["admin_email"], org_spec["admin_password"]
            )
            created_auth_ids.append(admin_id)
            db.add(
                User(
                    id=admin_id,
                    organization_id=organization.id,
                    email=org_spec["admin_email"],
                    role="admin",
                    full_name=f"{org_spec['name']} Admin",
                    status="active",
                )
            )
            print(f"  admin: {org_spec['admin_email']}  ({admin_id})")

            for idx, (emp_email, emp_password) in enumerate(org_spec["employees"], start=1):
                emp_id = create_auth_user(supabase_admin, emp_email, emp_password)
                created_auth_ids.append(emp_id)
                db.add(
                    User(
                        id=emp_id,
                        organization_id=organization.id,
                        email=emp_email,
                        role="employee",
                        full_name=f"{org_spec['name']} Employee {idx}",
                        invited_by=admin_id,
                        status="active",
                    )
                )
                print(f"  employee {idx}: {emp_email}  ({emp_id})")

        db.commit()
        print("\nAll 3 organizations, 3 admins, 6 employees committed.")
        return 0

    except AuthError as exc:
        db.rollback()
        print(f"\nSupabase Auth rejected a create_user call: {exc}")
        print(f"Rolling back {len(created_auth_ids)} auth user(s) created so far in this run...")
        for uid in created_auth_ids:
            delete_auth_user(supabase_admin, uid)
        return 1

    except Exception:
        db.rollback()
        print(f"\nUnexpected error. Rolling back {len(created_auth_ids)} auth user(s)...")
        for uid in created_auth_ids:
            delete_auth_user(supabase_admin, uid)
        raise

    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
