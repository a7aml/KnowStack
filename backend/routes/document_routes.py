"""Admin-only document upload/list/delete. Actual ingestion (extract ->
chunk -> embed) runs out of process via Celery — see
tasks/ingestion_tasks.py. Chat/retrieval over the resulting chunks is a
separate, not-yet-built feature and isn't touched here."""

import logging
import uuid

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy.orm import Session

from config.database import get_db
from controllers import document_controller
from middleware.auth_middleware import AuthContext, require_admin
from middleware.rate_limit_middleware import InMemoryWindowLimiter, limiter
from schemas.document_schema import (
    DocumentActionResponse,
    DocumentListResponse,
    DocumentUploadResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

# Per-org limits on top of the per-IP @limiter.limit decorators below — an
# admin uploading from multiple IPs (or many admins in one org) shouldn't be
# able to exceed a per-org budget that's really about controlling OpenAI
# embedding spend. Same InMemoryWindowLimiter pattern as employee_routes.py.
_upload_limiter = InMemoryWindowLimiter()
_delete_limiter = InMemoryWindowLimiter()


@router.post("/upload", response_model=DocumentUploadResponse, status_code=202)
@limiter.limit("30/hour")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    _upload_limiter.check(
        f"upload:{admin.organization_id}", max_attempts=20, window_seconds=60 * 60
    )
    content = await file.read()
    document = document_controller.create_document(db, admin, file, content)
    uploader_names = document_controller.attach_uploader_names(db, [document])
    return DocumentUploadResponse(
        document=document_controller.to_document_public(document, uploader_names),
        message="Document uploaded. Processing has started.",
    )


@router.get("", response_model=DocumentListResponse)
def list_documents(
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> DocumentListResponse:
    documents, total = document_controller.list_documents(
        db, admin, page=page, page_size=page_size
    )
    uploader_names = document_controller.attach_uploader_names(db, documents)
    return DocumentListResponse(
        documents=[document_controller.to_document_public(d, uploader_names) for d in documents],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.delete("/{document_id}", response_model=DocumentActionResponse)
@limiter.limit("30/hour")
def delete_document(
    request: Request,
    document_id: uuid.UUID,
    admin: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DocumentActionResponse:
    _delete_limiter.check(
        f"delete:{admin.organization_id}", max_attempts=30, window_seconds=60 * 60
    )
    document_public = document_controller.delete_document(db, admin, document_id)
    return DocumentActionResponse(document=document_public, message="Document deleted.")
