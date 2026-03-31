#!/usr/bin/env python
"""
E2E Environment Verification Script

This script verifies that your environment is ready for E2E testing.
Run: python scripts/verify_e2e_env.py
"""

import os
import sys
import subprocess
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def print_header(title):
    """Print a formatted header."""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def print_status(name, status, message=""):
    """Print status with color."""
    if status == "OK":
        symbol = "✓"
    elif status == "ERROR":
        symbol = "✗"
    else:
        symbol = "○"

    print(f"  {symbol} {name}: {status}")
    if message:
        print(f"      {message}")


def check_python_version():
    """Check Python version."""
    print_header("Python Environment")

    version = sys.version_info
    version_str = f"{version.major}.{version.minor}.{version.micro}"

    if version.major >= 3 and version.minor >= 10:
        print_status("Python Version", "OK", f"v{version_str}")
        return True
    else:
        print_status("Python Version", "ERROR", f"v{version_str} (need 3.10+)")
        return False


def check_dependencies():
    """Check required Python packages."""
    print_header("Python Dependencies")

    required = [
        ("fastapi", "FastAPI"),
        ("sqlalchemy", "SQLAlchemy"),
        ("pydantic", "Pydantic"),
        ("pytest", "pytest"),
        ("httpx", "httpx"),
        ("langgraph", "LangGraph"),
    ]

    all_ok = True
    for module, name in required:
        try:
            __import__(module)
            print_status(name, "OK")
        except ImportError:
            print_status(name, "ERROR", "Not installed")
            all_ok = False

    return all_ok


def check_env_file():
    """Check .env file configuration."""
    print_header("Environment Variables")

    env_file = project_root / ".env"
    if not env_file.exists():
        print_status(".env File", "ERROR", "Not found - copy from .env.example")
        return False

    print_status(".env File", "OK", str(env_file))

    # Check required variables
    required_vars = [
        ("DASHSCOPE_API_KEY", True),  # True = should not be placeholder
        ("DATABASE_URL", True),
        ("DINGTALK_APP_KEY", False),  # Optional for testing
        ("DINGTALK_APP_SECRET", False),
        ("DINGTALK_AGENT_ID", False),
        ("INTERNAL_API_KEY", False),
    ]

    all_ok = True
    for var, check_value in required_vars:
        value = os.environ.get(var, "")
        if not value:
            # Try loading from .env
            try:
                from dotenv import load_dotenv
                load_dotenv(env_file)
                value = os.environ.get(var, "")
            except ImportError:
                pass

        if not value:
            print_status(var, "WARNING", "Not set")
        elif check_value and value.startswith("your_"):
            print_status(var, "WARNING", "Placeholder value")
        else:
            print_status(var, "OK", f"{'*' * 8}...{value[-4:] if len(value) > 12 else '****'}")

    return all_ok


def check_postgresql():
    """Check PostgreSQL connection."""
    print_header("PostgreSQL Database")

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("E2E_DATABASE_URL")

    if not db_url:
        print_status("Database URL", "ERROR", "Not configured")
        return False

    print_status("Database URL", "OK", f"postgresql://...@{db_url.split('@')[-1] if '@' in db_url else db_url}")

    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(db_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            print_status("Connection", "OK")
            print_status("PostgreSQL Version", "OK", version.split(',')[0])
        engine.dispose()
        return True

    except ImportError:
        print_status("Connection", "ERROR", "SQLAlchemy not installed")
        return False
    except Exception as e:
        print_status("Connection", "ERROR", str(e))
        return False


def check_docker():
    """Check Docker availability."""
    print_header("Docker")

    try:
        result = subprocess.run(
            ["docker", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            print_status("Docker", "OK", result.stdout.strip())
        else:
            print_status("Docker", "WARNING", "Not available")
            return False
    except FileNotFoundError:
        print_status("Docker", "WARNING", "Not installed")
        return False
    except Exception as e:
        print_status("Docker", "WARNING", str(e))
        return False

    # Check docker-compose
    try:
        result = subprocess.run(
            ["docker-compose", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            print_status("Docker Compose", "OK", result.stdout.strip())
            return True
    except Exception:
        pass

    # Try docker compose (newer syntax)
    try:
        result = subprocess.run(
            ["docker", "compose", "version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            print_status("Docker Compose", "OK", result.stdout.strip())
            return True
    except Exception:
        pass

    return False


def check_dingtalk():
    """Check DingTalk configuration."""
    print_header("DingTalk Configuration")

    app_key = os.environ.get("DINGTALK_APP_KEY", "")
    app_secret = os.environ.get("DINGTALK_APP_SECRET", "")
    agent_id = os.environ.get("DINGTALK_AGENT_ID", "")

    if app_key and not app_key.startswith("your_"):
        print_status("App Key", "OK")
    else:
        print_status("App Key", "WARNING", "Not configured (optional for testing)")

    if app_secret and not app_secret.startswith("your_"):
        print_status("App Secret", "OK")
    else:
        print_status("App Secret", "WARNING", "Not configured (optional for testing)")

    if agent_id and not agent_id.startswith("your_"):
        print_status("Agent ID", "OK")
    else:
        print_status("Agent ID", "WARNING", "Not configured (optional for testing)")

    return True


def run_basic_tests():
    """Run basic import and model tests."""
    print_header("Basic Functionality")

    try:
        from src.api.main import app
        print_status("FastAPI App", "OK")
    except Exception as e:
        print_status("FastAPI App", "ERROR", str(e))
        return False

    try:
        from src.models.database import Base
        print_status("Database Models", "OK")
    except Exception as e:
        print_status("Database Models", "ERROR", str(e))
        return False

    try:
        from src.core.graph import create_interview_graph
        graph = create_interview_graph()
        print_status("LangGraph", "OK")
    except Exception as e:
        print_status("LangGraph", "ERROR", str(e))
        return False

    try:
        from src.services.dingtalk import DingTalkService
        print_status("DingTalk Service", "OK")
    except Exception as e:
        print_status("DingTalk Service", "ERROR", str(e))
        return False

    return True


def print_summary(results):
    """Print summary and next steps."""
    print_header("Summary")

    all_ok = all(results.values())

    if all_ok:
        print("\n  ✅ Environment is ready for E2E testing!\n")
        print("  Next steps:")
        print("  1. Start PostgreSQL (if using Docker):")
        print("     cd interview-bot && docker-compose up -d db")
        print()
        print("  2. Run database migrations:")
        print("     alembic upgrade head")
        print()
        print("  3. Run E2E tests:")
        print("     pytest tests/e2e/ -v")
        print()
        print("  4. For real PostgreSQL tests, set:")
        print("     export E2E_DATABASE_URL=postgresql://user:password@localhost:5432/interview_bot")
        print()
    else:
        print("\n  ⚠️  Some issues found. Please fix them before running E2E tests.\n")

        for name, status in results.items():
            if not status:
                print(f"  - {name}: Needs attention")

        print("\n  Quick fixes:")
        print("  - Install dependencies: pip install -r requirements.txt")
        print("  - Copy .env.example to .env and fill in values")
        print("  - Start PostgreSQL: docker-compose up -d db")


def main():
    """Run all checks."""
    print("\n" + "=" * 60)
    print("  Interview Bot E2E Environment Verification")
    print("=" * 60)

    results = {
        "Python": check_python_version(),
        "Dependencies": check_dependencies(),
        "Environment": check_env_file(),
        "PostgreSQL": check_postgresql(),
        "Docker": check_docker(),
        "DingTalk": check_dingtalk(),
        "Basic Tests": run_basic_tests(),
    }

    print_summary(results)

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())