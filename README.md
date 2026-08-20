# KnowStack

Multi-tenant RAG SaaS platform.

## Stack

- **Backend**: FastAPI (MVC architecture)
- **Frontend**: Next.js + React + TypeScript + Tailwind CSS
- **Database / Auth / Storage / Vector Store**: Supabase (Postgres + pgvector)
- **LLM**: OpenAI

## Structure

```
KnowStack/
├── backend/        # FastAPI app (MVC)
├── frontend/       # Next.js app
└── .claude/        # Claude Code skills & rules
```

## Setup

See `.env.example` for required environment variables.

### Backend

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```
cd frontend
npm install
npm run dev
```

### Background jobs (Redis + Celery)

Redis is the Celery broker and result backend. Start it via Docker Compose:

```
docker-compose up redis
```

(add `-d` to run it in the background). Redis then listens on `localhost:6379`,
matching the default `REDIS_URL` in `.env.example`.

With Redis running, start the Celery worker from `backend/` (same venv as the
API):

```
cd backend
celery -A celery_app worker --loglevel=info
```

**On Windows**, Celery's default worker pool ("prefork") doesn't work — pass
`--pool=solo`:

```
celery -A celery_app worker --loglevel=info --pool=solo
```

The worker and the FastAPI app (`uvicorn main:app`) are separate processes —
run both if you need background tasks to actually execute.

There are no real background tasks yet — `backend/tasks/example_task.py` is a
placeholder used only to confirm the worker can pick up and execute a task via
Redis.
