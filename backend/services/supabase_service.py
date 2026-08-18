from functools import lru_cache
from urllib.parse import urlencode

from supabase import Client, create_client
from supabase_auth.types import User as SupabaseUser

from config.settings import settings


@lru_cache
def get_supabase_admin() -> Client:
    """Service-role client — bypasses RLS. Used only for privileged Auth admin
    operations (creating/deleting auth users), never for regular data access."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@lru_cache
def get_supabase_anon() -> Client:
    """Anon-key client — used only to verify a user's password via Supabase
    Auth's password grant, or to exchange a Google OAuth code for a session.
    No session/data access is performed with it."""
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def get_google_authorize_url(*, redirect_to: str, code_challenge: str) -> str:
    """Builds the Supabase GoTrue authorize URL that starts a Google PKCE
    OAuth flow. This is a plain browser-redirect target — no API key or
    supabase-py client call is needed to construct it, only to later
    exchange the resulting code (see exchange_google_oauth_code below).

    `redirect_to` must be present in the Supabase project's Auth ->
    URL Configuration -> Redirect URLs allowlist, or Supabase will refuse
    the redirect.
    """
    query = urlencode(
        {
            "provider": "google",
            "redirect_to": redirect_to,
            "code_challenge": code_challenge,
            "code_challenge_method": "s256",
        }
    )
    return f"{settings.supabase_url}/auth/v1/authorize?{query}"


def exchange_google_oauth_code(*, auth_code: str, code_verifier: str) -> SupabaseUser | None:
    """Exchanges a Google OAuth PKCE code for a Supabase session and returns
    the authenticated Supabase auth.users identity (id + email). The
    verifier is passed explicitly rather than relying on the shared client's
    internal storage, since that storage isn't safe to use across concurrent
    requests from different browsers on a stateless backend."""
    client = get_supabase_anon()
    auth_response = client.auth.exchange_code_for_session(
        {"auth_code": auth_code, "code_verifier": code_verifier}
    )
    return auth_response.user
