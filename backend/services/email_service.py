"""Resend integration for transactional email. Currently used only by the
employee invitation flow (invite / resend)."""

import logging

import resend

from config.settings import settings

logger = logging.getLogger(__name__)


def _client_configured() -> bool:
    return bool(settings.resend_api_key and settings.resend_from_email)


def send_invite_email(*, to_email: str, organization_name: str, invite_link: str) -> None:
    """Best-effort send. Raises only when Resend is configured but the send
    itself fails — callers decide how to surface that (the invite/resend
    endpoints still keep the invite row so an admin can retry via resend)."""
    if not _client_configured():
        logger.warning(
            "RESEND_API_KEY/RESEND_FROM_EMAIL not configured — skipping invite email to %s",
            to_email,
        )
        return

    resend.api_key = settings.resend_api_key

    try:
        resend.Emails.send(
            {
                "from": settings.resend_from_email,
                "to": [to_email],
                "subject": f"You're invited to join {organization_name} on KnowStack",
                "html": _invite_email_html(
                    organization_name=organization_name, invite_link=invite_link
                ),
            }
        )
    except Exception as exc:
        logger.exception("Failed to send invite email to %s via Resend", to_email)
        raise RuntimeError("Failed to send invite email") from exc


def _invite_email_html(*, organization_name: str, invite_link: str) -> str:
    return f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="margin-bottom: 4px;">You're invited to join {organization_name}</h2>
      <p style="color: #475569; line-height: 1.5;">
        An administrator has invited you to join their organization's workspace on KnowStack.
      </p>
      <p style="margin: 24px 0;">
        <a href="{invite_link}"
           style="display:inline-block;padding:10px 20px;background:#0f172a;color:#ffffff;
                  border-radius:6px;text-decoration:none;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="color: #64748b; font-size: 13px;">
        This link expires in 3 days. If you weren't expecting this invite, you can safely ignore this email.
      </p>
    </div>
    """
