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
