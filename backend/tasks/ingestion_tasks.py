"""The real document ingestion pipeline: fetch the uploaded file from
storage, extract its text, chunk it, embed each chunk, and store the
results. Enqueued by controllers/document_controller.py.create_document
right after the documents row is created — this is where the actual
extract -> chunk -> embed work happens, out of the request/response cycle.

Not part of chat/retrieval — this task only produces document_chunks rows;
nothing here reads them back for answering questions.
"""

import logging
import uuid

from sqlalchemy.orm import Session

from celery_app import celery_app
from config.database import SessionLocal
from models import Document, DocumentChunk
from services import document_service, embedding_service, ingestion_service

logger = logging.getLogger(__name__)

# documents.error_message is meant for a short, admin-facing status line, not
# a full traceback — truncated so one huge library error can't blow up the
# column with something unreadable anyway.
_MAX_ERROR_MESSAGE_LENGTH = 500


@celery_app.task(name="tasks.ingestion_tasks.process_document")
def process_document(document_id: str) -> None:
    db = SessionLocal()
    try:
        document = db.get(Document, uuid.UUID(document_id))
        if document is None:
            logger.error("process_document: document %s not found", document_id)
            return

        try:
            _run_pipeline(db, document)
            logger.info("Document %s processed successfully", document_id)
        except Exception as exc:
            logger.exception("Ingestion failed for document %s", document_id)
            _mark_failed(db, document, exc)
    finally:
        db.close()


def _run_pipeline(db: Session, document: Document) -> None:
    extension = document_service.extract_extension(document.file_name)

    content = document_service.download_file(path=document.storage_path)

    text = ingestion_service.extract_text(content, extension)
    if not text.strip():
        raise ValueError("No extractable text found in document")

    chunks = ingestion_service.chunk_text(text)
    if not chunks:
        raise ValueError("Document produced no chunks after splitting")

    embeddings = embedding_service.embed_texts(chunks)
    if len(embeddings) != len(chunks):
        raise RuntimeError("Embedding count did not match chunk count")

    # In case this is a retry of a previously-failed run that already
    # committed some chunks before failing later on — start from a clean
    # slate for this document rather than appending on top of leftovers.
    db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete(
        synchronize_session=False
    )

    for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        db.add(
            DocumentChunk(
                organization_id=document.organization_id,
                document_id=document.id,
                content=chunk,
                embedding=embedding,
                chunk_index=index,
            )
        )

    document.status = "ready"
    document.error_message = None
    # Single commit for the whole chunk set + status flip: nothing above
    # this point has touched the database, so any exception raised earlier
    # in this function leaves the session with uncommitted, rollback-able
    # state only — no risk of orphaned chunks from a partial write.
    db.commit()


def _mark_failed(db: Session, document: Document, exc: Exception) -> None:
    db.rollback()
    # Belt-and-suspenders on top of the rollback above: also explicitly
    # clear any chunks already persisted for this document (relevant if this
    # run is a retry of one that got partway through a previous commit).
    db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete(
        synchronize_session=False
    )
    document.status = "failed"
    document.error_message = str(exc)[:_MAX_ERROR_MESSAGE_LENGTH]
    db.commit()
