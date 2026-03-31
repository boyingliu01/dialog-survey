#!/bin/bash
# E2E Test Runner Script
# Usage: ./tests/e2e/run_e2e_tests.sh [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Interview Bot E2E Test Runner${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check Python environment
if ! command -v python &> /dev/null; then
    echo -e "${RED}Error: Python not found${NC}"
    exit 1
fi

# Activate virtual environment if exists
if [ -d "venv" ]; then
    echo -e "${YELLOW}Activating virtual environment...${NC}"
    source venv/Scripts/activate 2>/dev/null || source venv/bin/activate 2>/dev/null
fi

# Set default test options
TEST_DIR="tests/e2e"
VERBOSE="-v"
COVERAGE=false
SPECIFIC_TEST=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --coverage)
            COVERAGE=true
            shift
            ;;
        --verbose)
            VERBOSE="-vv"
            shift
            ;;
        --test)
            SPECIFIC_TEST="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --coverage    Run with coverage report"
            echo "  --verbose     More verbose output (-vv)"
            echo "  --test NAME   Run specific test (e.g., TestFullInterviewFlow)"
            echo "  --help        Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Set environment variables for testing
export INTERNAL_API_KEY="test-e2e-api-key-2024"
export PYTHONPATH="${PYTHONPATH}:${PROJECT_ROOT}"

# Create temp reports directory
TEMP_REPORTS=$(mktemp -d)
export REPORTS_DIR="$TEMP_REPORTS"

echo -e "${YELLOW}Test Directory:${NC} $TEST_DIR"
echo -e "${YELLOW}Reports Dir:${NC} $REPORTS_DIR"
echo ""

# Build pytest command
PYTEST_CMD="python -m pytest $TEST_DIR $VERBOSE --tb=short"

if [ "$COVERAGE" = true ]; then
    PYTEST_CMD="$PYTEST_CMD --cov=src --cov-report=html --cov-report=term"
fi

if [ -n "$SPECIFIC_TEST" ]; then
    PYTEST_CMD="$PYTEST_CMD -k '$SPECIFIC_TEST'"
fi

# Run tests
echo -e "${GREEN}Running E2E tests...${NC}"
echo ""
eval $PYTEST_CMD
TEST_RESULT=$?

# Cleanup
rm -rf "$TEMP_REPORTS"

# Exit with test result
if [ $TEST_RESULT -eq 0 ]; then
    echo ""
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}  All E2E tests passed!${NC}"
    echo -e "${GREEN}======================================${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}======================================${NC}"
    echo -e "${RED}  E2E tests failed!${NC}"
    echo -e "${RED}======================================${NC}"
    exit 1
fi
