"""Standalone diagnostic: verifies backend/.env can reach Supabase.

Run from backend/ with the venv active:
    python scripts/check_supabase_connection.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import settings  # noqa: E402


def check_database_url() -> bool:
    print("--- Postgres connection (DATABASE_URL) ---")

    if not settings.database_url or "[YOUR-PASSWORD]" in settings.database_url:
        print("SKIPPED: DATABASE_URL is missing or still has the [YOUR-PASSWORD] placeholder.")
        return False

    import psycopg2

    try:
        conn = psycopg2.connect(settings.database_url, connect_timeout=10)
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            cur.fetchone()
        conn.close()
        print("SUCCESS: connected and ran SELECT 1.")
        return True
    except Exception as exc:
        print(f"FAILED: {exc}")
        return False


def check_supabase_api() -> bool:
    print("\n--- Supabase API (SUPABASE_URL + SUPABASE_ANON_KEY) ---")

    if not settings.supabase_url or not settings.supabase_anon_key:
        print("SKIPPED: SUPABASE_URL or SUPABASE_ANON_KEY is not set.")
        return False

    from supabase import create_client

    try:
        client = create_client(settings.supabase_url, settings.supabase_anon_key)
        # Lightweight call that just needs a valid URL + key to respond.
        client.auth.get_session()
        print("SUCCESS: Supabase client created and reachable.")
        return True
    except Exception as exc:
        print(f"FAILED: {exc}")
        return False


if __name__ == "__main__":
    db_ok = check_database_url()
    api_ok = check_supabase_api()

    print("\n--- Summary ---")
    print(f"Postgres (DATABASE_URL): {'OK' if db_ok else 'NOT CONNECTED'}")
    print(f"Supabase API:            {'OK' if api_ok else 'NOT CONNECTED'}")

    sys.exit(0 if (db_ok or api_ok) else 1)
