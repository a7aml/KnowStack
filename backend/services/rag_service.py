"""Retrieval-augmented generation for the chat feature: embed the question,
find the most relevant document_chunks for the caller's organization, build
the prompt, and stream the answer back from OpenAI. Deliberately split into
small, independently-testable functions — retrieval, prompt-building, and
the streaming call are three separate steps, not one giant function.

Read-only against document_chunks: nothing here writes to documents or
document_chunks, and none of the upload/ingestion pipeline is touched."""

import logging
import uuid
from collections.abc import AsyncGenerator, Iterable

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from config.settings import settings
from models import Document, DocumentChunk
from services.embedding_service import embed_texts

logger = logging.getLogger(__name__)

CHAT_MODEL = "gpt-4o-mini"
TOP_K = 5
MAX_SNIPPET_LENGTH = 300

SYSTEM_PROMPT = (
    "You are KnowStack's knowledge assistant for this organization. Answer "
    "the user's question using ONLY the context passages below, which come "
    "from the organization's own uploaded documents. If the context doesn't "
    "contain enough information to answer, say so plainly instead of "
    "guessing or using outside knowledge. Be concise."
)

NO_KNOWLEDGE_BASE_MESSAGE = (
    "This organization hasn't uploaded any documents yet, so I don't have a "
    "knowledge base to answer from. Ask an admin to upload documents in the "
    "Documents tab, then try again."
)

# ChatChunkRow: one retrieved chunk paired with its parent document's file
# name (retrieve_relevant_chunks joins Document only for this display field).
ChatChunkRow = tuple[DocumentChunk, str]

_async_client: AsyncOpenAI | None = None


def _get_async_client() -> AsyncOpenAI:
    global _async_client
    if _async_client is None:
        _async_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _async_client


def has_ready_documents(db: Session, organization_id: uuid.UUID) -> bool:
    return (
        db.query(Document.id)
        .filter(Document.organization_id == organization_id, Document.status == "ready")
        .first()
        is not None
    )


def embed_question(question: str) -> list[float]:
    return embed_texts([question])[0]


def retrieve_relevant_chunks(
    db: Session, *, organization_id: uuid.UUID, question_embedding: list[float], top_k: int = TOP_K
) -> list[ChatChunkRow]:
    """Cosine-similarity search over document_chunks, hard-scoped to one
    organization. This is the most sensitive query in the app — every
    filter below is on organization_id (both directly on the chunk and via
    the join to its parent document), and there is no code path that skips
    or weakens that filter based on question content. A cross-org leak here
    would mean one org reading another org's private documents through
    chat, so this must never be relaxed."""
    rows = (
        db.query(DocumentChunk, Document.file_name)
        .join(Document, Document.id == DocumentChunk.document_id)
        .filter(DocumentChunk.organization_id == organization_id)
        .filter(Document.organization_id == organization_id)  # redundant on purpose: defense in depth
        .filter(Document.status == "ready")
        .filter(DocumentChunk.embedding.is_not(None))
        .order_by(DocumentChunk.embedding.cosine_distance(question_embedding))
        .limit(top_k)
        .all()
    )
    return [(chunk, file_name) for chunk, file_name in rows]


def build_sources(rows: Iterable[ChatChunkRow]) -> list[dict]:
    sources = []
    for chunk, file_name in rows:
        snippet = chunk.content.strip()
        if len(snippet) > MAX_SNIPPET_LENGTH:
            snippet = snippet[:MAX_SNIPPET_LENGTH].rstrip() + "…"
        sources.append(
            {
                "document_id": str(chunk.document_id),
                "file_name": file_name,
                "chunk_index": chunk.chunk_index,
                "snippet": snippet,
            }
        )
    return sources


def build_messages(question: str, rows: Iterable[ChatChunkRow]) -> list[dict]:
    rows = list(rows)
    if not rows:
        context = "No relevant context was found in the organization's documents."
    else:
        context = "\n\n".join(
            f"[Source {i + 1}: {file_name}]\n{chunk.content.strip()}"
            for i, (chunk, file_name) in enumerate(rows)
        )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]


async def stream_answer(question: str, rows: Iterable[ChatChunkRow]) -> AsyncGenerator[str, None]:
    """Yields text deltas from the chat completion as they arrive. Raises on
    any OpenAI API failure — the caller (chat_controller.stream_message)
    turns that into an SSE error event rather than a half-written answer."""
    client = _get_async_client()
    messages = build_messages(question, rows)
    stream = await client.chat.completions.create(
        model=CHAT_MODEL, messages=messages, stream=True, temperature=0.2
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
