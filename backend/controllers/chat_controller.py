"""Glue between routes/chat_routes.py and services/{chat_service,rag_service}.py.
Session/message persistence lives in chat_service; retrieval, prompt
building, and the OpenAI streaming call live in rag_service. Every lookup
here is scoped by both organization_id and user_id off the caller's
AuthContext — chat history is private per user, never shared across an org
the way documents are. Available to both admin and employee accounts; there
is no admin-only gate anywhere in this module."""

import json
import logging
import uuid
from collections.abc import AsyncGenerator

from sqlalchemy.orm import Session

from config.database import SessionLocal
from middleware.auth_middleware import AuthContext
from models import ChatSession, Log
from schemas.chat_schema import ChatSessionPublic
from services import chat_service, rag_service

logger = logging.getLogger(__name__)

# Deliberately logging only that a question was asked (and to which
# session), not the question text or the answer — question content can
# carry sensitive business information that an admin reviewing the audit
# log shouldn't casually be able to read. Flagging this as the explicit
# "what's appropriate to log" decision the task asked for.


def create_session(db: Session, user: AuthContext) -> ChatSession:
    return chat_service.create_session(db, user)


def list_sessions(db: Session, user: AuthContext) -> list[ChatSession]:
    return chat_service.list_sessions(db, user)


def get_session_for_user(db: Session, user: AuthContext, session_id: uuid.UUID) -> ChatSession:
    return chat_service.get_session_for_user(db, user, session_id)


def list_messages(db: Session, user: AuthContext, session_id: uuid.UUID):
    session = chat_service.get_session_for_user(db, user, session_id)
    return chat_service.list_messages(db, session)


def delete_session(db: Session, user: AuthContext, session_id: uuid.UUID) -> ChatSessionPublic:
    session = chat_service.get_session_for_user(db, user, session_id)

    # Snapshotted before delete+commit, same reasoning as
    # document_controller.delete_document: once the row is gone, re-reading
    # attributes off the expired ORM instance would raise ObjectDeletedError.
    snapshot = ChatSessionPublic.model_validate(session)

    chat_service.delete_session(db, session)
    db.add(
        Log(
            organization_id=user.organization_id,
            user_id=user.user_id,
            action="chat_session_deleted",
            metadata_={"session_id": str(session_id)},
        )
    )
    db.commit()
    logger.info("Chat session %s deleted by %s", session_id, user.user_id)
    return snapshot


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_message(
    *, user: AuthContext, session_id: uuid.UUID, question: str
) -> AsyncGenerator[str, None]:
    """Owns its own DB session for the lifetime of the stream, independent
    of the request-scoped session used for the up-front ownership check in
    routes/chat_routes.py. This mirrors the SessionLocal()-per-unit-of-work
    pattern tasks/ingestion_tasks.py uses for the same reason: this
    generator keeps running (and needs a live session) well after the route
    handler function itself has already returned the StreamingResponse."""
    db = SessionLocal()
    try:
        session = chat_service.get_session_for_user(db, user, session_id)

        db.add(
            Log(
                organization_id=user.organization_id,
                user_id=user.user_id,
                action="chat_question_asked",
                metadata_={"session_id": str(session_id)},
            )
        )
        db.commit()

        if not rag_service.has_ready_documents(db, user.organization_id):
            answer = rag_service.NO_KNOWLEDGE_BASE_MESSAGE
            yield _sse("token", {"text": answer})
            yield _sse("sources", {"sources": []})
            chat_service.save_exchange(db, session=session, question=question, answer=answer, sources=[])
            yield _sse("done", {})
            return

        embedding = rag_service.embed_question(question)
        rows = rag_service.retrieve_relevant_chunks(
            db, organization_id=user.organization_id, question_embedding=embedding
        )
        sources = rag_service.build_sources(rows)

        answer_parts: list[str] = []
        async for delta in rag_service.stream_answer(question, rows):
            answer_parts.append(delta)
            yield _sse("token", {"text": delta})

        answer = "".join(answer_parts).strip() or "I couldn't generate a response. Please try again."

        yield _sse("sources", {"sources": sources})
        chat_service.save_exchange(db, session=session, question=question, answer=answer, sources=sources)
        yield _sse("done", {})
    except Exception:
        # Nothing is persisted on failure — chat_service.save_exchange is
        # only ever called after a full answer is in hand, so a mid-stream
        # failure simply leaves no record of this exchange rather than a
        # half-written one.
        logger.exception("Chat streaming failed for session %s", session_id)
        yield _sse("error", {"message": "Something went wrong generating a response. Please try again."})
    finally:
        db.close()
