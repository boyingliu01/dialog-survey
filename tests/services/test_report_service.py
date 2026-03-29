"""
Tests for ReportService - report persistence to filesystem.
"""

import os
from pathlib import Path
from unittest.mock import patch

import pytest

# These imports will fail until we create ReportService - this is intentional (TDD RED phase)
# The tests should fail first, then we implement the service


class TestReportServiceInit:
    """Tests for ReportService initialization."""

    def test_report_service_init_with_defaults(self, monkeypatch):
        """Test ReportService initializes with default reports directory."""
        # Clear REPORTS_DIR env var to use default
        monkeypatch.delenv("REPORTS_DIR", raising=False)

        from src.services.report_service import ReportService

        service = ReportService()

        assert service.reports_dir == Path("reports")

    def test_report_service_init_with_custom_dir(self):
        """Test ReportService initializes with custom reports directory."""
        from src.services.report_service import ReportService

        custom_dir = "/custom/reports/path"
        service = ReportService(reports_dir=custom_dir)

        assert service.reports_dir == Path(custom_dir)

    def test_report_service_init_with_env_var(self, monkeypatch):
        """Test ReportService uses REPORTS_DIR from environment."""
        monkeypatch.setenv("REPORTS_DIR", "/env/reports")

        from src.services.report_service import ReportService

        service = ReportService()

        assert service.reports_dir == Path("/env/reports")


class TestReportServiceSave:
    """Tests for ReportService.save_report method."""

    def test_report_service_save_creates_file(self, tmp_path):
        """Test save_report creates a file with correct content."""
        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "test_session_001"
        content = "# Test Report\n\nThis is a test report content."

        result_path = service.save_report(session_id, content)

        # Verify file was created
        assert os.path.exists(result_path)

        # Verify content
        with open(result_path, encoding="utf-8") as f:
            saved_content = f.read()
        assert saved_content == content

    def test_report_service_save_returns_path(self, tmp_path):
        """Test save_report returns the file path."""
        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "test_session_002"
        content = "# Report Content"

        result_path = service.save_report(session_id, content)

        # Verify returned path is a string
        assert isinstance(result_path, str)

        # Verify path contains session_id
        assert session_id in result_path

    def test_report_service_creates_directory(self, tmp_path):
        """Test save_report creates directory if it doesn't exist."""
        from src.services.report_service import ReportService

        # Use a subdirectory that doesn't exist yet
        reports_dir = tmp_path / "new_reports_dir"
        service = ReportService(reports_dir=str(reports_dir))

        # Verify the directory doesn't exist initially
        assert not reports_dir.exists()

        session_id = "test_session_003"
        content = "# Report"

        result_path = service.save_report(session_id, content)

        # Verify directory was created
        assert reports_dir.exists()

        # Verify session subdirectory was created
        session_dir = reports_dir / session_id
        assert session_dir.exists()

    def test_report_path_format(self, tmp_path):
        """Test report filename format is correct: report_{timestamp}.md."""
        from datetime import datetime

        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "test_session_004"
        content = "# Report"

        # Mock datetime to get predictable timestamp
        mock_now = datetime(2025, 1, 15, 10, 30, 45)
        with patch("src.services.report_service.datetime") as mock_datetime:
            mock_datetime.now.return_value = mock_now
            result_path = service.save_report(session_id, content)

        # Verify filename format
        path_obj = Path(result_path)
        assert path_obj.name == "report_20250115_103045.md"

        # Verify path structure: {reports_dir}/{session_id}/report_{timestamp}.md
        assert path_obj.parent.name == session_id
        assert path_obj.parent.parent == tmp_path

    def test_report_service_save_with_unicode_content(self, tmp_path):
        """Test save_report handles unicode content correctly."""
        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "test_session_unicode"
        content = "# 中文报告\n\n这是测试内容，包含特殊字符：©️ ® ² ³"

        result_path = service.save_report(session_id, content)

        # Verify unicode content is preserved
        with open(result_path, encoding="utf-8") as f:
            saved_content = f.read()
        assert saved_content == content
        assert "中文报告" in saved_content

    def test_report_service_save_multiple_reports(self, tmp_path):
        """Test save_report can save multiple reports for same session with different timestamps."""
        from datetime import datetime

        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "test_session_multi"
        content1 = "# Report 1"
        content2 = "# Report 2"

        # Mock datetime to return different timestamps for each call
        mock_times = [
            datetime(2025, 1, 15, 10, 30, 0),
            datetime(2025, 1, 15, 10, 30, 5),  # 5 seconds later
        ]

        with patch("src.services.report_service.datetime") as mock_datetime:
            mock_datetime.now.side_effect = mock_times
            path1 = service.save_report(session_id, content1)
            path2 = service.save_report(session_id, content2)

        # Both files should exist (different timestamps)
        assert os.path.exists(path1)
        assert os.path.exists(path2)

        # Files should be different paths
        assert path1 != path2

        # Verify different content in each file
        with open(path1, encoding="utf-8") as f:
            assert f.read() == content1
        with open(path2, encoding="utf-8") as f:
            assert f.read() == content2

    def test_report_service_handles_empty_content(self, tmp_path):
        """Test save_report handles empty content."""
        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "test_empty"
        content = ""

        result_path = service.save_report(session_id, content)

        # File should be created even with empty content
        assert os.path.exists(result_path)

        with open(result_path, encoding="utf-8") as f:
            saved_content = f.read()
        assert saved_content == ""


class TestReportServicePathGeneration:
    """Tests for report path generation."""

    def test_path_contains_session_id(self, tmp_path):
        """Test generated path contains session_id."""
        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "unique_session_xyz"
        content = "# Report"

        result_path = service.save_report(session_id, content)

        assert session_id in result_path

    def test_path_is_cross_platform(self, tmp_path):
        """Test path uses pathlib for cross-platform compatibility."""
        from src.services.report_service import ReportService

        service = ReportService(reports_dir=str(tmp_path))

        session_id = "cross_platform_test"
        content = "# Report"

        result_path = service.save_report(session_id, content)

        # Path should be valid on current platform
        path_obj = Path(result_path)
        assert path_obj.exists()

        # Should work with pathlib operations
        assert path_obj.is_file()
        assert path_obj.suffix == ".md"

    def test_reports_dir_uses_pathlib(self):
        """Test reports_dir is stored as Path object."""
        from src.services.report_service import ReportService

        service = ReportService(reports_dir="/some/path")

        assert isinstance(service.reports_dir, Path)
