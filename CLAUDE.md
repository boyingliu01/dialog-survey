# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered interview robot that conducts async multi-turn interviews via DingTalk. Uses LangGraph for conversation flow, FastAPI for API, DashScope (Alibaba Qwen) for LLM, Fun-ASR for voice transcription, and PostgreSQL for persistence.

The actual application lives in `interview-bot/` subdirectory, which is also its own git repository.

## Commands

All commands run from `interview-bot/`:

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database tables
python -c "from src.models.database import init_db; init_db()"

# Run database migrations (Alembic)
alembic upgrade head
alembic downgrade -1

# Run development server
uvicorn src.api.main:app --reload

# Run all tests
pytest

# Run single test file
pytest tests/models/test_database.py

# Run single test function
pytest tests/models/test_database.py::TestClassName::test_method_name

# Run with coverage
pytest --cov=src --cov-report=html

# Run with Docker
docker-compose up -d
```

## Architecture

Four-layer architecture:

1. **Access Layer** — DingTalk webhook (`/api/webhook`) receives text/voice messages, verifies signatures, ASR converts voice to text
2. **Application Layer** — LangGraph state machine drives conversation; DingTalk adapter handles message parsing and session routing
3. **AI Service Layer** — Two Qwen model roles: `qwen-max` for main dialogue + report generation, `qwen-turbo` for follow-up judgment
4. **Storage Layer** — PostgreSQL for session state (via SQLAlchemy), JSON files for interview templates, Markdown files for generated reports under `reports/{interview_id}/`

### LangGraph Conversation Flow

```
planning → interviewing → [follow-up? yes→followup→interviewing | no→next topic] → analyzing → completed
```

State is persisted via `MemorySaver` checkpointer across message turns. All state fields are TypedDict. The `should_continue` conditional edge function controls branching.

### Key Source Layout

```
interview-bot/src/
├── api/          # FastAPI routers, Pydantic request/response models
├── core/         # LangGraph graph definition, InterviewState TypedDict, node functions
├── services/     # QwenService (LLM singleton), AsrService (voice), DingTalk adapter
├── models/       # SQLAlchemy ORM: Interview, Message; database.py has get_db() + init_db()
├── templates/    # JSON interview templates (loaded by TemplateService)
└── reports/      # Generated Markdown reports
```

### Interview Templates

Templates are JSON files in `templates/` with this structure:
- `topics[]` — Interview topics, each with `id`, `name`, `description`, `initial_question`
- `questions[]` — Questions with `id`, `type` (rating/text/single_choice/yes_no), `text`, optional `follow_ups[]`, optional `condition` for conditional display
- `domain_context` — Context passed to LLM for domain-specific understanding

### Testing Fixtures

Use pytest fixtures from `tests/conftest.py`:
- `mock_llm_service` — Mocked LLM service for testing without API calls
- `temp_dir` — Temporary directory for file operations
- `template_manager` — TemplateService with isolated templates
- `base_interview_state` / `populated_interview_state` — InterviewState for testing
- `mock_dingtalk_service` — Mocked DingTalk service

### Service Singletons

`QwenService` and `AsrService` use module-level `_instance` with `get_instance()` pattern. Always use `Depends(get_db)` for database sessions in FastAPI endpoints.

### Environment Variables

Required in `interview-bot/.env` (copy from `.env.example`):
- `DASHSCOPE_API_KEY` — Alibaba DashScope API key
- `DATABASE_URL` — PostgreSQL connection string
- `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`, `DINGTALK_AGENT_ID`
- `PUBLIC_URL` — Public HTTPS URL for DingTalk callback registration
- `INTERNAL_API_KEY` — API key for authenticating internal endpoints (required)

Optional:
- `MAX_LLM_RETRIES` — LLM call retry count (default: 2)
- `LLM_TIMEOUT` — LLM call timeout in seconds (default: 30)
- `REPORTS_DIR` — Directory for generated reports (default: `reports/`)
- `CORS_ORIGINS` — Comma-separated list of allowed CORS origins (default: none, blocks cross-origin)

## API Endpoints

- `GET /api/webhook` — DingTalk webhook verification
- `POST /api/webhook` — DingTalk message handler (text and voice)
- `GET /api/interviews` — List interviews (`status`, `limit`, `offset` query params) ⚠️ Requires `X-API-Key` header
- `GET /api/interviews/{session_id}` — Get interview details with messages ⚠️ Requires `X-API-Key` header
- `GET /api/interviews/{session_id}/report` — Get generated report ⚠️ Requires `X-API-Key` header
- `POST /api/interviews/{session_id}/end` — End an in-progress interview ⚠️ Requires `X-API-Key` header
- `GET /api/templates` — List available interview templates
- `GET /api/templates/{template_id}` — Get template details

## Generated Reports

Reports are saved as Markdown files under `reports/{session_id}/report_{timestamp}.md`. The `report_path` is stored in the `Interview` model.

## Design Docs

Detailed requirements, architecture, and implementation plans are in `docs/plans/`.

## Docker Deployment

The project includes `Dockerfile` and `docker-compose.yml` for containerized deployment:

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```
