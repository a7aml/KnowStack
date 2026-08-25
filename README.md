# KnowStack

Multi-tenant RAG knowledge platform for organizations.

## Overview

KnowStack lets an organization stand up its own private knowledge base and chat interface on top of it. An admin creates the organization, invites employees, and uploads documents that are ingested and embedded into a vector store. Employees log in, ask questions in a chat interface, and get answers grounded in the organization's own documents, with citations back to the source material.

Every organization's data is isolated from every other organization's: application-level checks scope queries by `organization_id`, and Postgres Row Level Security policies enforce the same boundary at the database layer, so a compromised or buggy query can't leak another tenant's data.

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: Next.js + React + TypeScript + Tailwind CSS
- **Database / Auth / Storage / Vector Store**: Supabase (Postgres + pgvector + Supabase Auth + Supabase Storage)
- **LLM**: OpenAI
- **Background jobs**: Celery + Redis

## Architecture

The backend follows an MVC-style layout: `routes/` define HTTP endpoints, `controllers/` handle request orchestration, `services/` hold business logic and third-party integrations, and `models/`/`schemas/` define persistence and API data shapes respectively.

Multi-tenant isolation is enforced in two layers:
- **Application layer**: every authenticated request carries an `organization_id` (and `role`) resolved from the session JWT, and queries are scoped accordingly.
- **Database layer**: Postgres RLS policies on `organizations`, `users`, `documents`, `document_chunks`, `chat_sessions`, `chat_messages`, and `logs` restrict rows to the caller's own organization (and, for chat data, to the owning user), using `organization_id`/`role` claims read from `auth.jwt()`. Tables written only by backend pipelines (e.g. `document_chunks`) have no client-facing write policies at all — those writes go through the Supabase `service_role` connection, which bypasses RLS.

## Features

- **Admin authentication** — email/password signup and login, plus "Continue with Google" (Supabase-backed OAuth), with organization onboarding for first-time sign-ins
- **Employee invitations** — admins invite employees by email, employees accept an invite to set up their account; invites can be resent or revoked
- **Document upload & ingestion** — admins upload documents, which are parsed, chunked, embedded, and stored asynchronously via a Celery worker
- **RAG chat with citations** — employees chat against the organization's ingested documents, with retrieval-augmented answers that cite source documents
- **Dashboard analytics** — usage stats, an activity chart, and an audit log table for admins
- **Organization settings** — view and update organization details
- **User management** — admins list, view, activate/deactivate, and remove employee accounts

## Project Structure

```
KnowStack/
├── backend/
│   ├── alembic/                    # Database migrations
│   │   └── versions/
│   ├── config/                     # Settings and database config
│   ├── controllers/                # Request orchestration
│   ├── middleware/                 # Auth, rate limiting, tenant isolation
│   ├── models/                     # ORM / data models
│   ├── routes/                     # FastAPI routers
│   ├── schemas/                    # Pydantic request/response schemas
│   ├── scripts/                    # One-off operational scripts
│   ├── services/                   # Business logic & integrations (OpenAI, Supabase, email, RAG, ingestion)
│   ├── tasks/                      # Celery tasks
│   ├── utils/                      # Shared utilities (JWT, etc.)
│   ├── celery_app.py               # Celery app entrypoint
│   ├── main.py                     # FastAPI app entrypoint
│   └── requirements.txt
│
└── frontend/
    ├── app/
    │   ├── (employee)/             # Employee login, signup, accept-invite, chat
    │   └── admin/                  # Admin login, signup, onboarding, dashboard,
    │                                #   documents, chat, users, logs, settings
    ├── components/
    │   ├── auth/
    │   ├── chat/
    │   ├── dashboard/
    │   ├── marketing/
    │   └── ui/
    ├── hooks/
    ├── lib/                        # API client, Supabase client, validation, utils
    └── public/
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (for running Redis locally)
- A Supabase project (Postgres + pgvector + Auth + Storage)
- An OpenAI API key

### Environment Variables

Create a `.env` file in `backend/` with the following keys:

```
# --- Supabase ---
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# --- OpenAI ---
OPENAI_API_KEY=

# --- Backend ---
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
ENVIRONMENT=development
FRONTEND_ORIGIN=http://localhost:3000

# --- Auth (session JWTs issued by this backend) ---
JWT_SECRET_KEY=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# --- Redis / Celery ---
REDIS_URL=redis://localhost:6379/0

# --- Transactional email (employee invites, via Resend) ---
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

And a `.env.local` file in `frontend/`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Installation

**Backend:**

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

**Frontend:**

```
cd frontend
npm install
```

### Database Migrations

Run Alembic migrations against your Supabase Postgres database:

```
cd backend
alembic upgrade head
```

### Running the App

Each of these runs in its own terminal, from the directories indicated.

**Redis** (broker/result backend for Celery):

```
docker-compose up redis
```

**Celery worker** (from `backend/`, same venv as the API):

```
celery -A celery_app worker --loglevel=info
```

On Windows, pass `--pool=solo` (the default "prefork" pool doesn't work there):

```
celery -A celery_app worker --loglevel=info --pool=solo
```

**Backend API** (from `backend/`):

```
uvicorn main:app --reload
```

**Frontend dev server** (from `frontend/`):

```
npm run dev
```

## Third-Party Setup

- **Google OAuth**: admin "Continue with Google" sign-in relies on Google OAuth being configured as a provider in your Supabase project's Auth settings (client ID/secret, authorized redirect URI). This must be set up in the Supabase dashboard — it isn't provisioned by this repo.
- **Resend**: employee invite emails are sent via Resend. `RESEND_API_KEY` and `RESEND_FROM_EMAIL` must correspond to a configured Resend account and verified sending domain. If left unset, invite emails are logged instead of sent, which is fine for local development but not for a real deployment.
