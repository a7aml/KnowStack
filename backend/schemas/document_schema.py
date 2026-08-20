import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Extension -> the single MIME type the upload endpoint accepts for it.
# Enforced together with a magic-byte check in services/document_service.py
# — an extension alone is just a filename suffix, never trusted on its own.
ALLOWED_EXTENSIONS: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20MB

DocumentStatus = Literal["pending", "processing", "ready", "failed"]


class DocumentPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    file_name: str
    file_size: int
    status: DocumentStatus
    error_message: str | None
    uploaded_by: uuid.UUID | None
    uploaded_by_name: str | None = None
    created_at: datetime


class DocumentListResponse(BaseModel):
    documents: list[DocumentPublic]
    total: int
    page: int
    page_size: int


class DocumentUploadResponse(BaseModel):
    document: DocumentPublic
    message: str


class DocumentActionResponse(BaseModel):
    document: DocumentPublic
    message: str
