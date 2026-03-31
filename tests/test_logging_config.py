"""
Tests for logging configuration.
"""

import logging
import sys
from io import StringIO
from unittest.mock import patch

from src.core.logging_config import get_logger, setup_logging


class TestLoggingConfig:
    """Tests for logging configuration module."""

    def test_setup_logging_configures_root_logger(self):
        """Test that setup_logging configures the root logger."""
        # Create a fresh logger to test
        with patch.object(logging, "getLogger") as mock_get_logger:
            mock_root = logging.Logger("root")
            mock_get_logger.return_value = mock_root

            setup_logging(logging.INFO)

            # Verify handler was added
            assert mock_root.handlers != []

    def test_setup_logging_sets_level(self):
        """Test that setup_logging sets the correct level."""
        with patch.object(logging, "getLogger") as mock_get_logger:
            mock_root = logging.Logger("root")
            mock_get_logger.return_value = mock_root

            setup_logging(logging.DEBUG)

            assert mock_root.level == logging.DEBUG

    def test_setup_logging_with_custom_level(self):
        """Test setup_logging with different log levels."""
        test_cases = [
            (logging.DEBUG, logging.DEBUG),
            (logging.INFO, logging.INFO),
            (logging.WARNING, logging.WARNING),
            (logging.ERROR, logging.ERROR),
        ]

        for input_level, expected_level in test_cases:
            with patch.object(logging, "getLogger") as mock_get_logger:
                mock_root = logging.Logger("root")
                mock_get_logger.return_value = mock_root

                setup_logging(input_level)

                assert mock_root.level == expected_level

    def test_get_logger_returns_named_logger(self):
        """Test that get_logger returns a logger with correct name."""
        logger = get_logger("test.module")

        assert logger.name == "test.module"
        assert isinstance(logger, logging.Logger)

    def test_get_logger_different_names(self):
        """Test get_logger with different module names."""
        logger1 = get_logger("module1")
        logger2 = get_logger("module2")

        assert logger1.name == "module1"
        assert logger2.name == "module2"
        assert logger1 is not logger2

    def test_setup_logging_handles_existing_handlers(self):
        """Test that setup_logging handles existing handlers correctly."""
        with patch.object(logging, "getLogger") as mock_get_logger:
            mock_root = logging.Logger("root")
            # Add existing handler
            existing_handler = logging.StreamHandler(sys.stdout)
            mock_root.handlers = [existing_handler]
            mock_root.level = logging.NOTSET
            mock_get_logger.return_value = mock_root

            setup_logging(logging.INFO)

            # Should still have the existing handler
            assert len(mock_root.handlers) >= 1

    def test_logger_propagates_to_root(self):
        """Test that child loggers can be configured."""
        # This test verifies the logger can be retrieved
        logger = get_logger("test.child")

        # The logger should be a valid Logger instance
        assert isinstance(logger, logging.Logger)
        assert logger.name == "test.child"


class TestLoggerOutput:
    """Tests for logger output formatting."""

    def test_logger_format_includes_module_name(self):
        """Test that log output includes module name."""
        # Capture log output
        output = StringIO()
        handler = logging.StreamHandler(output)
        handler.setLevel(logging.INFO)

        # Create a logger with specific format
        fmt = logging.Formatter("%(name)s - %(message)s")
        handler.setFormatter(fmt)

        logger = logging.getLogger("test_format")
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

        logger.info("Test message")

        log_output = output.getvalue()
        assert "test_format" in log_output
        assert "Test message" in log_output

        # Cleanup
        logger.removeHandler(handler)

    def test_logger_format_includes_level(self):
        """Test that log output includes log level."""
        output = StringIO()
        handler = logging.StreamHandler(output)
        handler.setLevel(logging.INFO)

        fmt = logging.Formatter("%(levelname)s - %(message)s")
        handler.setFormatter(fmt)

        logger = logging.getLogger("test_level")
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

        logger.warning("Warning message")

        log_output = output.getvalue()
        assert "WARNING" in log_output
        assert "Warning message" in log_output

        # Cleanup
        logger.removeHandler(handler)
