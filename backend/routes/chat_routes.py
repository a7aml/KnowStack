"""Chat endpoints — available to both admin and employee accounts (any
authenticated user via get_current_user), unlike most of this API which is
admin-only. Retrieval and prompt-building live in services/rag_service.py;
session/message persistence lives in services/chat_service.py. Does not
touch document upload/ingestion — this only reads existing document_chunks
rows written by that pipeline."""

import logging
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from config.database import get_db
from controllers import chat_controller
from middleware.auth_middleware import AuthContext, get_current_user
from middleware.rate_limit_middleware import InMemoryWindowLimiter, limiter
from schemas.chat_schema import (
    ChatMessageListResponse,
    ChatMessagePublic,
    ChatSessionActionResponse,
    ChatSessionListResponse,
    ChatSessionPublic,
    SendMessageRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Per-user and per-org budgets on top of the per-IP @limiter.limit decorator
# below — this is the one endpoint in the app that spends real money per
# call (an embedding + a gpt-4o-mini completion), so it gets its own,
# tighter limits than the generic per-IP one. Same InMemoryWindowLimiter
# pattern as employee_routes.py / document_routes.py.
_message_user_limiter = InMemoryWindowLimiter()
_message_org_limiter = InMemoryWindowLimiter()


@router.post("/sessions", response_model=ChatSessionActionResponse, status_code=201)
def create_session(
    user: AuthContext = Depends(get_current_user), db: Session = Depends(get_db)
) -> ChatSessionActionResponse:
    session = chat_controller.create_session(db, user)
    return ChatSessionActionResponse(
        session=ChatSessionPublic.model_validate(session), message="Chat session created."
    )


@router.get("/sessions", response_model=ChatSessionListResponse)
def list_sessions(
    user: AuthContext = Depends(get_current_user), db: Session = Depends(get_db)
) -> ChatSessionListResponse:
    sessions = chat_controller.list_sessions(db, user)
    return ChatSessionListResponse(sessions=[ChatSessionPublic.model_validate(s) for s in sessions])


# Registered above the dynamic "/sessions/{session_id}/messages" route on
# purpose — same reasoning as employee_routes.py's static-before-dynamic
# ordering note, even though "sessions" and "messages" aren't literally
# ambiguous here, keeping the convention consistent avoids ever having to
# think about it again as more routes are added.


@router.get("/sessions/{session_id}/messages", response_model=ChatMessageListResponse)
def list_messages(
    session_id: uuid.UUID,
    user: AuthContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatMessageListResponse:
    messages = chat_controller.list_messages(db, user, session_id)
    return ChatMessageListResponse(messages=[ChatMessagePublic.model_validate(m) for m in messages])


@router.delete("/sessions/{session_id}", response_model=ChatSessionActionResponse)
@limiter.limit("30/hour")
def delete_session(
    request: Request,
    session_id: uuid.UUID,
    user: AuthContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatSessionActionResponse:
    session_public = chat_controller.delete_session(db, user, session_id)
    return ChatSessionActionResponse(session=session_public, message="Chat session deleted.")


@router.post("/sessions/{session_id}/messages")
@limiter.limit("20/minute")
async def send_message(
    request: Request,
    session_id: uuid.UUID,
    payload: SendMessageRequest,
    user: AuthContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    _message_user_limiter.check(
        f"chat_user:{user.user_id}", max_attempts=30, window_seconds=60 * 60
    )
    _message_org_limiter.check(
        f"chat_org:{user.organization_id}", max_attempts=150, window_seconds=60 * 60
    )

    # Ownership validated up front against the request-scoped session, so an
    # invalid/foreign session id returns a normal 404 rather than a 200 SSE
    # stream carrying an error event.
    chat_controller.get_session_for_user(db, user, session_id)

    return StreamingResponse(
        chat_controller.stream_message(user=user, session_id=session_id, question=payload.question),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disables response buffering on nginx-style reverse proxies,
            # which would otherwise wait for the stream to end before
            # forwarding anything — defeating the point of streaming.
            "X-Accel-Buffering": "no",
        },
    )
