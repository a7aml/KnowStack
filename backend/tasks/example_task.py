"""Placeholder tasks used only to verify the Celery + Redis pipeline works
end to end. Not part of the real RAG pipeline — delete once real tasks
(document processing, embeddings, etc.) exist."""

import logging

from celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.example_task.add")
def add(x: int, y: int) -> int:
    return x + y


@celery_app.task(name="tasks.example_task.ping")
def ping() -> str:
    logger.info("Celery is working")
    return "Celery is working"
