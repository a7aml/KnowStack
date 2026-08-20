"""Chat session/message persistence — no retrieval or OpenAI calls here; see
services/rag_service.py for that. Every read/write here is scoped by both
organization_id and user_id off the caller's AuthContext: unlike documents
(shared across an org), chat history is private per user, so a session or
message that doesn't belong to the requesting user must be indistinguishable
from one that doesn't exist at all."""

import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from middleware.auth_middleware import AuthContext
from models import ChatMessage, ChatSession

logger = logging.getLogger(__name__)

TITLE_MAX_LENGTH = 80


def create_session(db: Session, user: AuthContext) -> ChatSession:
    session = ChatSession(organization_id=user.organization_id, user_id=user.user_id, title=None)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_sessions(db: Session, user: AuthContext) -> list[ChatSession]:
    return (
        db.query(ChatSession)
        .filter(
            ChatSession.organization_id == user.organization_id,
            ChatSession.user_id == user.user_id,
        )
        .order_by(ChatSession.created_at.desc())
        .all()
    )


def get_session_for_user(db: Session, user: AuthContext, session_id: uuid.UUID) -> ChatSession:
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.organization_id == user.organization_id,
            ChatSession.user_id == user.user_id,
        )
        .first()
    )
    if session is None:
        # 404 regardless of whether the id doesn't exist, belongs to another
        # user, or another org entirely — same not-found-vs-forbidden
        # reasoning as every other owner-scoped lookup in this codebase
        # (see employee_controller.get_user).
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found.")
    return session


def list_messages(db: Session, session: ChatSession) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )


def delete_session(db: Session, session: ChatSession) -> None:
    db.delete(session)  # chat_messages cascade via ondelete="CASCADE"
    db.commit()


def _derive_title(question: str) -> str:
    collapsed = " ".join(question.split())
    if len(collapsed) <= TITLE_MAX_LENGTH:
        return collapsed
    return collapsed[:TITLE_MAX_LENGTH].rstrip() + "…"


def save_exchange(
    db: Session, *, session: ChatSession, question: str, answer: str, sources: list[dict]
) -> tuple[ChatMessage, ChatMessage]:
    """Persists the user question and assistant answer as a pair, only once
    the full streamed answer is available — see
    controllers/chat_controller.py.stream_message, which calls this after
    the stream completes, never mid-stream. Also titles the session from its
    first question if it doesn't have a title yet."""
    is_first_message = (
        db.query(ChatMessage.id).filter(ChatMessage.session_id == session.id).first() is None
    )

    user_message = ChatMessage(
        session_id=session.id,
        organization_id=session.organization_id,
        role="user",
        content=question,
    )
    assistant_message = ChatMessage(
        session_id=session.id,
        organization_id=session.organization_id,
        role="assistant",
        content=answer,
        sources=sources or None,
    )
    db.add(user_message)
    db.add(assistant_message)

    if is_first_message and not session.title:
        session.title = _derive_title(question)

    db.commit()
    logger.info("Saved chat exchange for session %s", session.id)
    return user_message, assistant_message
