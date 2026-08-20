"""Text extraction and chunking for the document ingestion pipeline. Pure
functions only — no DB, storage, or Celery concerns — so each step is
testable on its own. See services/embedding_service.py for the next stage
(embedding the chunks this module produces) and tasks/ingestion_tasks.py for
how the two are wired together."""

import io

import docx
import tiktoken
from pypdf import PdfReader

# cl100k_base is the tokenizer used by text-embedding-3-small (and every
# other current OpenAI model) — used here purely to size chunks by token
# count, not to talk to the API.
_ENCODING = tiktoken.get_encoding("cl100k_base")

DEFAULT_CHUNK_TOKENS = 500
DEFAULT_CHUNK_OVERLAP_TOKENS = 50


def extract_text(content: bytes, extension: str) -> str:
    if extension == ".pdf":
        return _extract_pdf(content)
    if extension == ".docx":
        return _extract_docx(content)
    if extension == ".txt":
        return _extract_txt(content)
    raise ValueError(f"Unsupported file extension: {extension}")


def _extract_pdf(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise ValueError(f"Could not extract text from PDF: {exc}") from exc
    return "\n\n".join(pages).strip()


def _extract_docx(content: bytes) -> str:
    try:
        document = docx.Document(io.BytesIO(content))
        paragraphs = [p.text for p in document.paragraphs]
    except Exception as exc:
        raise ValueError(f"Could not extract text from DOCX: {exc}") from exc
    return "\n".join(paragraphs).strip()


def _extract_txt(content: bytes) -> str:
    try:
        return content.decode("utf-8").strip()
    except UnicodeDecodeError:
        return content.decode("latin-1", errors="replace").strip()


def chunk_text(
    text: str,
    *,
    chunk_tokens: int = DEFAULT_CHUNK_TOKENS,
    overlap_tokens: int = DEFAULT_CHUNK_OVERLAP_TOKENS,
) -> list[str]:
    """Splits text into fixed-size, overlapping chunks measured in tokens
    (not characters/words), so chunk size stays accurate for whatever the
    embedding model actually sees. Consecutive chunks share `overlap_tokens`
    of context so a sentence that straddles a chunk boundary isn't lost from
    retrieval entirely."""
    stripped = text.strip()
    if not stripped:
        return []

    tokens = _ENCODING.encode(stripped)
    if not tokens:
        return []

    step = max(chunk_tokens - overlap_tokens, 1)
    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        window = tokens[start : start + chunk_tokens]
        chunk = _ENCODING.decode(window).strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_tokens >= len(tokens):
            break
        start += step

    return chunks
