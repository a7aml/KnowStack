"""OpenAI embeddings for the document ingestion pipeline. Kept separate from
ingestion_service.py's extraction/chunking so the one step that makes a
network call (and costs money per token) is isolated and easy to mock in
tests."""

import logging
from functools import lru_cache

from openai import OpenAI

from config.settings import settings

logger = logging.getLogger(__name__)

# 1536-dim output — must match models/document_model.py's EMBEDDING_DIM.
EMBEDDING_MODEL = "text-embedding-3-small"

# Keeps individual API requests to a reasonable size rather than sending an
# entire (potentially very long) document's chunks in one call.
_BATCH_SIZE = 100


@lru_cache
def _get_client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Returns one embedding per input text, in the same order. Raises
    RuntimeError on any API failure — callers (tasks/ingestion_tasks.py)
    treat that as a failed ingestion for the whole document."""
    if not texts:
        return []

    client = _get_client()
    embeddings: list[list[float]] = []
    try:
        for i in range(0, len(texts), _BATCH_SIZE):
            batch = texts[i : i + _BATCH_SIZE]
            response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
            embeddings.extend(item.embedding for item in response.data)
    except Exception as exc:
        logger.exception("Failed to generate embeddings via OpenAI")
        raise RuntimeError("Failed to generate embeddings") from exc

    return embeddings
