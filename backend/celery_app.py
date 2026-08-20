"""Celery application setup — infrastructure only. See
tasks/ingestion_tasks.py for the real document-processing task, and
tasks/example_task.py for the placeholder that originally proved the
Celery + Redis pipeline works end to end.

Celery runs as its own process, separate from the FastAPI app (main.py is
deliberately untouched by this setup — the API and the worker are two
independent processes that both import this module):

    celery -A celery_app worker --loglevel=info

On Windows, Celery's default "prefork" worker pool doesn't work — pass
--pool=solo instead. See README.md for the exact commands.
"""

from celery import Celery

from config.settings import settings

celery_app = Celery(
    "knowstack",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["tasks.example_task", "tasks.ingestion_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Hard limit: the worker process executing the task is killed if it
    # runs longer than this. Soft limit: the task gets a catchable
    # SoftTimeLimitExceeded first, so it can clean up before that happens.
    # Generous placeholder values — tune once real tasks (document
    # processing, embeddings) exist and their actual runtime is known.
    task_time_limit=300,
    task_soft_time_limit=240,
)
