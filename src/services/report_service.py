"""
ReportService for persisting interview reports to filesystem.
"""

import os
from datetime import datetime
from pathlib import Path


class ReportService:
    """Service for saving interview reports to the filesystem.

    Reports are saved as Markdown files under:
    {reports_dir}/{session_id}/report_{timestamp}.md

    The path is stored in Interview.report_path for later retrieval.
    """

    def __init__(self, reports_dir: str | None = None):
        """Initialize ReportService with reports directory.

        Args:
            reports_dir: Directory for storing reports. Defaults to
                         REPORTS_DIR env var or 'reports' if not set.
        """
        self.reports_dir = Path(reports_dir or os.getenv("REPORTS_DIR", "reports"))

    def save_report(self, session_id: str, content: str) -> str:
        """Save report to filesystem.

        Creates the session directory if it doesn't exist and saves
        the report as a Markdown file with timestamp in filename.

        Args:
            session_id: Interview session ID (used as subdirectory name)
            content: Report content (Markdown format)

        Returns:
            str: Absolute path to the saved report file
        """
        # Create session directory: {reports_dir}/{session_id}
        report_dir = self.reports_dir / session_id
        report_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename with timestamp: report_{timestamp}.md
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"report_{timestamp}.md"
        filepath = report_dir / filename

        # Write report content
        filepath.write_text(content, encoding="utf-8")

        return str(filepath)


# Singleton pattern for service instance
_instance: ReportService | None = None


def get_report_service() -> ReportService:
    """Get singleton ReportService instance.

    Returns:
        ReportService: The singleton service instance
    """
    global _instance
    if _instance is None:
        _instance = ReportService()
    return _instance
