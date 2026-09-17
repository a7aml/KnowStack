"""Admin-only document management: upload, list, delete. Upload validates
and stores the file, then hands off the actual extract/chunk/embed pipeline
to run out of the request/response cycle — this controller never blocks a
request on that work.

TEMPORARY: ingestion normally runs via a Celery task (tasks/ingestion_tasks.py)
but is currently triggered via FastAPI BackgroundTasks instead — see
create_document() below for why and how to revert. Chat/retrieval over the
resulting chunks is a separate, not-yet-built feature."""

import logging
import uuid

from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy.orm import Query, Session

from middleware.auth_middleware import AuthContext
from models import Document, DocumentChunk, Log, User
from schemas.document_schema import ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES, DocumentPublic
from services import document_service

logger = logging.getLogger(__name__)


def _paginate(query: Query, *, page: int, page_size: int) -> tuple[list, int]:
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def attach_uploader_names(db: Session, documents: list[Document]) -> dict[uuid.UUID, str | None]:
    """Batched lookup of uploader display names for a page of documents,
    instead of one query per row. Same pattern as
    employee_controller.attach_inviter_names."""
    uploader_ids = {d.uploaded_by for d in documents if d.uploaded_by is not None}
    if not uploader_ids:
        return {}
    uploaders = db.query(User).filter(User.id.in_(uploader_ids)).all()
    return {u.id: (u.full_name or u.email) for u in uploaders}


def to_document_public(
    document: Document, uploader_names: dict[uuid.UUID, str | None]
) -> DocumentPublic:
    return DocumentPublic(
        id=document.id,
        file_name=document.file_name,
        file_size=document.file_size,
        status=document.status,
        error_message=document.error_message,
        uploaded_by=document.uploaded_by,
        uploaded_by_name=uploader_names.get(document.uploaded_by) if document.uploaded_by else None,
        created_at=document.created_at,
    )


def list_documents(
    db: Session, admin: AuthContext, *, page: int, page_size: int
) -> tuple[list[Document], int]:
    query = (
        db.query(Document)
        .filter(Document.organization_id == admin.organization_id)
        .order_by(Document.created_at.desc())
    )
    return _paginate(query, page=page, page_size=page_size)


def _log_document_action(
    db: Session, *, admin: AuthContext, action: str, document: Document, extra: dict | None = None
) -> None:
    metadata = {"document_id": str(document.id), "file_name": document.file_name}
    if extra:
        metadata.update(extra)
    db.add(
        Log(
            organization_id=admin.organization_id,
            user_id=admin.user_id,
            action=action,
            metadata_=metadata,
        )
    )


def create_document(
    db: Session,
    admin: AuthContext,
    file: UploadFile,
    content: bytes,
    background_tasks: BackgroundTasks,
) -> Document:
    """`content` is the already-read request body — read by the route
    handler (an `await` the route can do but this synchronous controller
    can't) before validation, so a too-large upload is rejected with a clear
    413 rather than however FastAPI/Starlette would fail on a stream over
    the ASGI size limit."""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A file name is required.")

    extension = document_service.extract_extension(file.filename)
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty.")

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB size limit.",
        )

    if not document_service.validate_content_type(content, extension):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match its extension.",
        )

    safe_filename = document_service.sanitize_filename(file.filename)
    document_id = uuid.uuid4()
    storage_path = document_service.build_storage_path(
        organization_id=admin.organization_id, document_id=document_id, filename=safe_filename
    )

    try:
        document_service.upload_file(
            path=storage_path, content=content, content_type=ALLOWED_EXTENSIONS[extension]
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to store the file. Try again."
        ) from exc

    document = Document(
        id=document_id,
        organization_id=admin.organization_id,
        uploaded_by=admin.user_id,
        file_name=safe_filename,
        storage_path=storage_path,
        file_size=len(content),
        status="processing",
    )
    db.add(document)
    _log_document_action(db, admin=admin, action="document_uploaded", document=document)
    db.commit()
    logger.info("Document %s uploaded by %s in org %s", document.id, admin.user_id, admin.organization_id)

    # Imported here (not at module load) to avoid the controller layer
    # importing Celery task/broker machinery for every request that merely
    # touches this module — only upload actually needs it.
    from tasks.ingestion_tasks import run_ingestion

    # --- TEMPORARY: Celery bypass -------------------------------------------
    # Railway's free tier only runs a single web service, so there's no
    # worker process available to consume Celery tasks. Until a separate
    # worker service is provisioned, ingestion is triggered via FastAPI's
    # BackgroundTasks (runs after the response is sent, doesn't block this
    # request) instead of tasks.ingestion_tasks.process_document.delay().
    #
    # Both paths call the same tasks.ingestion_tasks.run_ingestion() function,
    # so the extract/chunk/embed pipeline logic itself is not duplicated.
    #
    # TODO(celery): once a worker service exists again, revert this to
    #   process_document.delay(str(document.id))
    # (restoring the try/except that marks the document "failed" if the
    # broker is unreachable) and drop the background_tasks parameter from
    # this function and its callers. celery_app.py, the worker Procfile
    # line, and the @celery_app.task decorator on process_document are left
    # untouched for exactly this.
    background_tasks.add_task(run_ingestion, str(document.id))
    # -------------------------------------------------------------------------

    return document


def get_document_for_org(db: Session, admin: AuthContext, document_id: uuid.UUID) -> Document:
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.organization_id == admin.organization_id)
        .first()
    )
    if document is None:
        # 404 (not 403) regardless of whether the id doesn't exist at all or
        # belongs to another organization — same reasoning as
        # employee_controller.get_user.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return document


def delete_document(db: Session, admin: AuthContext, document_id: uuid.UUID) -> DocumentPublic:
    document = get_document_for_org(db, admin, document_id)

    # Snapshotted into a Pydantic model before the row is actually deleted:
    # once db.commit() below removes it, the ORM instance's attributes are
    # expired and re-accessing them (e.g. from the route handler) would hit
    # the database for a row that no longer exists and raise
    # ObjectDeletedError. Returning a plain data snapshot instead sidesteps
    # that entirely.
    uploader_names = attach_uploader_names(db, [document])
    document_public = to_document_public(document, uploader_names)

    document_service.delete_file(path=document.storage_path)

    db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete(
        synchronize_session=False
    )

    _log_document_action(db, admin=admin, action="document_deleted", document=document)

    db.delete(document)
    db.commit()
    logger.info("Document %s deleted by %s in org %s", document_id, admin.user_id, admin.organization_id)
    return document_public
