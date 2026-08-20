"""File storage handling for the Documents tab: filename sanitization, basic
content-type validation (extension + magic bytes), and the Supabase Storage
wrappers used to upload/download/delete the underlying file. No HTTP
concerns here — callers (document_controller, tasks/ingestion_tasks)
translate failures into the response/log shape they need."""

import logging
import re
import uuid

from services.supabase_service import get_supabase_admin

logger = logging.getLogger(__name__)

# All documents live in one bucket, partitioned by org/document id in the
# object path (see build_storage_path) — Supabase Storage has no native
# per-prefix ACL, so tenant isolation here is enforced entirely by this
# backend only ever reading/writing paths scoped to admin.organization_id,
# same trust boundary as every DB query in this codebase.
DOCUMENTS_BUCKET = "documents"

_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")

# Extension -> (magic bytes, offset). Checked against the first bytes of the
# uploaded content so a renamed .exe can't slip through as a .pdf. .txt has
# no reliable magic number, so it isn't in this table — validate_content_type
# applies a separate heuristic for it.
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF-",),
    # .docx is a zip container — PK\x03\x04 is the standard local-file-header
    # signature for a non-empty zip, which every real .docx is.
    ".docx": (b"PK\x03\x04",),
}


def sanitize_filename(filename: str) -> str:
    """Strips any directory components and replaces anything that isn't
    alphanumeric/dot/dash/underscore, so the sanitized name can never be used
    for path traversal (e.g. '../../etc/passwd') or break the storage path
    it's interpolated into."""
    base = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    base = _UNSAFE_FILENAME_CHARS.sub("_", base)
    base = base.strip("._") or "file"
    return base[:200]


def extract_extension(filename: str) -> str:
    dot = filename.rfind(".")
    if dot == -1:
        return ""
    return filename[dot:].lower()


def validate_content_type(content: bytes, extension: str) -> bool:
    """Best-effort magic-byte check — not a full file-format validator, just
    enough to catch a disguised file (wrong extension for its real content)."""
    if extension == ".txt":
        # No magic number for plain text. Treat a null byte in the first
        # chunk as a strong signal this isn't text, which is the common case
        # for a renamed binary file.
        return b"\x00" not in content[:8192]

    signatures = _MAGIC_BYTES.get(extension)
    if signatures is None:
        return False
    return any(content.startswith(sig) for sig in signatures)


def build_storage_path(*, organization_id: uuid.UUID, document_id: uuid.UUID, filename: str) -> str:
    return f"{organization_id}/documents/{document_id}/{filename}"


def upload_file(*, path: str, content: bytes, content_type: str) -> None:
    try:
        get_supabase_admin().storage.from_(DOCUMENTS_BUCKET).upload(
            path, content, {"content-type": content_type}
        )
    except Exception as exc:
        logger.exception("Failed to upload document to storage path %s", path)
        raise RuntimeError("Failed to upload file to storage") from exc


def download_file(*, path: str) -> bytes:
    try:
        return get_supabase_admin().storage.from_(DOCUMENTS_BUCKET).download(path)
    except Exception as exc:
        logger.exception("Failed to download document from storage path %s", path)
        raise RuntimeError("Failed to download file from storage") from exc


def delete_file(*, path: str) -> None:
    try:
        get_supabase_admin().storage.from_(DOCUMENTS_BUCKET).remove([path])
    except Exception:
        # Best-effort: an orphaned storage object is a cheap cleanup task
        # later, whereas failing the whole delete over it would leave the DB
        # row (and its chunks) stuck when the admin has already confirmed
        # they want this document gone.
        logger.exception("Failed to delete document from storage path %s", path)
