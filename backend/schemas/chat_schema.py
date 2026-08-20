import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

QUESTION_MAX_LENGTH = 2000

ChatRole = Literal["user", "assistant", "system"]


class ChatSessionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    created_at: datetime


class ChatSessionListResponse(BaseModel):
    sessions: list[ChatSessionPublic]


class ChatSessionActionResponse(BaseModel):
    session: ChatSessionPublic
    message: str


class SourceCitation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: uuid.UUID
    file_name: str
    chunk_index: int
    snippet: str


class ChatMessagePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: ChatRole
    content: str
    sources: list[SourceCitation] | None
    created_at: datetime


class ChatMessageListResponse(BaseModel):
    messages: list[ChatMessagePublic]


class SendMessageRequest(BaseModel):
    question: str = Field(min_length=1, max_length=QUESTION_MAX_LENGTH)

    @field_validator("question")
    @classmethod
    def not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped
