# End-to-End Testing Guide

This directory contains end-to-end (E2E) tests for the Interview Bot system.

## Overview

E2E tests verify the complete user flow through the system:
1. DingTalk webhook message reception
2. Interview state machine (LangGraph)
3. Database persistence
4. Report generation
5. REST API operations

## Test Structure

```
tests/e2e/
├── conftest.py                      # Shared fixtures and configuration
├── __init__.py
├── test_complete_interview_flow.py  # Full interview workflow tests
├── test_dingtalk_webhook_flow.py    # DingTalk webhook integration tests
├── test_postgres_e2e.py             # Real PostgreSQL tests
├── test_dingtalk_real.py            # Real DingTalk API tests
└── README.md                        # This file
```

## Quick Start

### 1. Verify Environment

Run the environment verification script:

```bash
cd interview-bot/
python scripts/verify_e2e_env.py
```

This will check:
- Python version and dependencies
- Environment variables
- PostgreSQL connection
- DingTalk configuration
- Basic functionality

### 2. Run Tests with SQLite (Default)

```bash
# Run all E2E tests with in-memory SQLite
pytest tests/e2e/ -v

# Run specific test file
pytest tests/e2e/test_complete_interview_flow.py -v
```

## Prerequisites

### Environment Setup

```bash
# Navigate to project directory
cd interview-bot/

# Create virtual environment (if not exists)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
.\venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt
```

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Required for all tests
INTERNAL_API_KEY=test-e2e-api-key-2024

# Required for PostgreSQL tests
E2E_DATABASE_URL=postgresql://user:password@localhost:5432/interview_bot

# Optional - for real DingTalk testing
DINGTALK_APP_KEY=your_app_key
DINGTALK_APP_SECRET=your_app_secret
DINGTALK_AGENT_ID=your_agent_id
DINGTALK_TEST_USER_ID=user_id_for_testing  # Real user to receive test messages
```

## PostgreSQL E2E Tests

### Start PostgreSQL with Docker

```bash
# Start PostgreSQL container
docker-compose up -d db

# Wait for it to be ready
docker-compose logs -f db  # Ctrl+C when you see "database system is ready"

# Run migrations
alembic upgrade head
```

### Run PostgreSQL Tests

```bash
# Set database URL for E2E tests
export E2E_DATABASE_URL=postgresql://user:password@localhost:5432/interview_bot

# Run PostgreSQL-specific tests
pytest tests/e2e/test_postgres_e2e.py -v

# Or run all E2E tests (PostgreSQL tests will be skipped if URL not set)
pytest tests/e2e/ -v
```

### Manual PostgreSQL Setup (Alternative)

If you have PostgreSQL installed locally:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE interview_bot_test;"

# Create user
psql -U postgres -c "CREATE USER test_user WITH PASSWORD 'test_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE interview_bot_test TO test_user;"

# Set environment variable
export E2E_DATABASE_URL=postgresql://test_user:test_password@localhost:5432/interview_bot_test
```

## DingTalk Real API Tests

### Prerequisites

1. DingTalk developer account
2. Created H5 micro-application
3. App Key, App Secret, and Agent ID

### Configuration

```bash
# Set environment variables
export DINGTALK_APP_KEY=your_app_key
export DINGTALK_APP_SECRET=your_app_secret
export DINGTALK_AGENT_ID=your_agent_id
export DINGTALK_TEST_USER_ID=user_id_for_testing  # Optional
```

### Run DingTalk Tests

```bash
# Run DingTalk integration tests
pytest tests/e2e/test_dingtalk_real.py -v -m "not skip_ci"

# Skip tests that require real API calls
pytest tests/e2e/test_dingtalk_real.py -v
```

### Webhook Testing with ngrok

For real webhook testing:

```bash
# Start ngrok
ngrok http 8000

# Copy the HTTPS URL and update .env
export PUBLIC_URL=https://your-ngrok-url.ngrok.io

# Register webhook URL in DingTalk developer console
# URL: https://your-ngrok-url.ngrok.io/api/webhook

# Start the server
uvicorn src.api.main:app --reload

# Send test messages from DingTalk app
```

## Running Tests

### Run All E2E Tests

```bash
# From interview-bot/ directory
pytest tests/e2e/ -v

# Or with coverage
pytest tests/e2e/ --cov=src --cov-report=html --cov-report=term
```

### Run Specific Test Files

```bash
# Interview flow tests
pytest tests/e2e/test_complete_interview_flow.py -v

# DingTalk webhook tests
pytest tests/e2e/test_dingtalk_webhook_flow.py -v

# PostgreSQL tests
pytest tests/e2e/test_postgres_e2e.py -v

# DingTalk real API tests
pytest tests/e2e/test_dingtalk_real.py -v
```

### Run Specific Test Classes

```bash
# Interview state machine tests
pytest tests/e2e/test_complete_interview_flow.py::TestInterviewStateMachine -v

# Full flow test
pytest tests/e2e/test_complete_interview_flow.py::TestFullInterviewFlow -v

# PostgreSQL connection tests
pytest tests/e2e/test_postgres_e2e.py::TestPostgreSQLConnection -v
```

## Test Scenarios

### 1. Complete Interview Flow (`TestFullInterviewFlow`)

Tests a full interview session:
- Start interview via webhook
- Answer questions through multiple turns
- Receive follow-up questions when triggered
- Complete interview and generate report
- Retrieve report via API

### 2. Interview State Machine (`TestInterviewStateMachine`)

Tests LangGraph state transitions:
- `planning` → initializes interview
- `interviewing` → processes answers
- `followup` → generates follow-up questions
- `analyzing` → generates report
- `completed` → final state

### 3. DingTalk Webhook (`TestDingTalkWebhookVerification`, etc.)

Tests webhook integration:
- URL verification (GET challenge)
- Text message handling
- Voice message handling
- Signature verification
- Error handling

### 4. PostgreSQL Tests (`TestPostgreSQLConnection`, etc.)

Tests with real PostgreSQL:
- Database connection
- JSONB conversation history
- Message storage
- Pagination
- Concurrent sessions
- Report path storage

### 5. REST API (`TestInterviewCRUDEndpoints`, etc.)

Tests API endpoints:
- List/Create/Read interviews
- Filter by status
- Pagination
- End interview
- Get reports

## Mock Services

E2E tests use mocked services for:

| Service | Mock Behavior |
|---------|---------------|
| LLM (Qwen) | Returns deterministic responses |
| DingTalk | Parses test payloads, skips signature verification |
| Database | SQLite in-memory (default) |

To use real services, see below.

## Using Real Services

### Real PostgreSQL

```bash
# Set environment variable
export E2E_DATABASE_URL="postgresql://user:password@localhost:5432/interview_bot"

# Run tests
pytest tests/e2e/test_postgres_e2e.py -v
```

### Real LLM Service

Remove the mock patch in tests to use real DashScope API:

```python
# In test file, comment out:
# with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
```

⚠️ **Warning**: Real LLM calls cost money and add latency.

### Real DingTalk

1. Configure credentials in `.env`
2. Set `DINGTALK_TEST_USER_ID` for sending test messages
3. Run tests with `-m "not skip_ci"` marker

## Troubleshooting

### Import Errors

If you get import errors, ensure you're running from the correct directory:

```bash
cd interview-bot/
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
pytest tests/e2e/ -v
```

### Database Connection Errors

If using PostgreSQL:
- Check database is running: `docker ps | grep postgres`
- Check connection string format
- Verify credentials
- Run: `python scripts/verify_e2e_env.py`

### Test Hangs

If tests hang:
- Check no other process is using the test database
- For SQLite: ensure no file locking issues
- Ctrl+C to stop, then re-run

### Mock Not Being Used

Ensure patches are applied correctly:

```python
# Correct: patch where it's used, not where it's defined
with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
```

### PostgreSQL Container Not Starting

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs db

# Restart container
docker-compose restart db
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: user
          POSTGRES_PASSWORD: password
          POSTGRES_DB: interview_bot_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd interview-bot
          pip install -r requirements.txt

      - name: Run E2E tests
        run: |
          cd interview-bot
          pytest tests/e2e/ -v --junitxml=e2e-results.xml
        env:
          E2E_DATABASE_URL: postgresql://user:password@localhost:5432/interview_bot_test
          INTERNAL_API_KEY: test-${{ secrets.TEST_API_KEY }}
          CI: true
```

## Contact

For issues with E2E tests, check:
1. Test logs in `tests/e2e/` directory
2. Application logs
3. Database connection status
4. Run `python scripts/verify_e2e_env.py` for diagnosis
