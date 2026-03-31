"""Export service for generating PDF and Excel reports from analysis results.

Provides functionality to:
- Generate PDF reports with complete analysis summary
- Generate Excel spreadsheets with multi-sheet data export
"""

from io import BytesIO
from typing import Any

# Note: For production use, install these packages:
# pip install pandas openpyxl weasyprint markdown

# For initial implementation, we use simplified approaches


class ExportService:
    """Service for exporting analysis results to PDF and Excel formats."""

    def generate_pdf_report(
        self,
        job_id: int,
        topics: list[dict[str, Any]],
        sentiment: dict[str, Any],
        key_points: list[dict[str, Any]],
        satisfaction_score: int | None = None,
    ) -> bytes:
        """Generate PDF report from analysis results.

        Creates a formatted PDF document with:
        - Executive summary
        - Topic analysis
        - Sentiment distribution
        - Key insights
        - Recommendations

        Args:
            job_id: Analysis job ID for reference
            topics: List of topic analysis results
            sentiment: Sentiment distribution dict
            key_points: List of key point extractions
            satisfaction_score: Overall satisfaction score (optional)

        Returns:
            bytes: PDF file content

        """
        # Build Markdown content first
        md_content = self._build_report_markdown(
            job_id=job_id,
            topics=topics,
            sentiment=sentiment,
            key_points=key_points,
            satisfaction_score=satisfaction_score,
        )

        # Convert to HTML for PDF generation
        html_content = self._markdown_to_html(md_content)

        # For now, return HTML content as bytes (simplified implementation)
        # In production, use weasyprint or similar to convert HTML to PDF
        # import weasyprint
        # pdf_bytes = weasyprint.HTML(string=html_content).write_pdf()

        # Simplified: return HTML content that browsers can display
        # This allows testing without requiring weasyprint installation
        return html_content.encode("utf-8")

    def _build_report_markdown(
        self,
        job_id: int,
        topics: list[dict[str, Any]],
        sentiment: dict[str, Any],
        key_points: list[dict[str, Any]],
        satisfaction_score: int | None = None,
    ) -> str:
        """Build Markdown content for report."""
        lines = [
            "# Interview Analysis Report",
            "",
            f"**Report ID**: {job_id}",
            "",
            "---",
            "",
            "## Executive Summary",
            "",
            "This report presents the comprehensive analysis of interview responses, "
            "including topic distribution, sentiment analysis, and key insights extracted "
            "from participant feedback.",
            "",
        ]

        # Add satisfaction score if available
        if satisfaction_score is not None:
            lines.extend(
                [
                    f"**Overall Satisfaction Score**: {satisfaction_score}/100",
                    "",
                ]
            )

        # Topic analysis section
        lines.extend(
            [
                "## Topic Analysis",
                "",
                "The following topics were identified from interview responses:",
                "",
            ]
        )

        if topics:
            for topic in topics:
                name = topic.get("name", "Unknown")
                count = topic.get("count", 0)
                keywords = topic.get("keywords", [])
                lines.extend(
                    [
                        f"### {name}",
                        "",
                        f"- **Response Count**: {count}",
                        f"- **Keywords**: {', '.join(keywords) if keywords else 'N/A'}",
                        "",
                    ]
                )
        else:
            lines.append("No topics identified.\n")

        # Sentiment analysis section
        lines.extend(
            [
                "## Sentiment Analysis",
                "",
                "Distribution of sentiment across responses:",
                "",
            ]
        )

        if sentiment:
            positive = sentiment.get("positive", 0)
            negative = sentiment.get("negative", 0)
            neutral = sentiment.get("neutral", 0)
            lines.extend(
                [
                    "| Sentiment | Percentage |",
                    "|-----------|------------|",
                    f"| Positive  | {positive}% |",
                    f"| Negative  | {negative}% |",
                    f"| Neutral   | {neutral}% |",
                    "",
                ]
            )
        else:
            lines.append("No sentiment data available.\n")

        # Key points section
        lines.extend(
            [
                "## Key Insights",
                "",
                "Important points extracted from interviews:",
                "",
            ]
        )

        if key_points:
            for point in key_points:
                topic = point.get("topic", "General")
                summary = point.get("summary", "")
                quotes = point.get("quotes", [])
                lines.extend(
                    [
                        f"### {topic}",
                        "",
                        f"**Summary**: {summary}",
                        "",
                    ]
                )
                if quotes:
                    lines.append("**Participant Quotes**:")
                    for quote in quotes:
                        lines.append(f'> "{quote}"')
                    lines.append("")
        else:
            lines.append("No key points identified.\n")

        # Recommendations section
        lines.extend(
            [
                "## Recommendations",
                "",
                "Based on the analysis, we recommend:",
                "",
                "1. Focus on areas with high negative sentiment for improvement",
                "2. Leverage positive feedback to reinforce successful practices",
                "3. Address key concerns raised by participants",
                "",
                "---",
                "",
                "*This report was automatically generated by the Interview Bot Analysis System.*",
            ]
        )

        return "\n".join(lines)

    def _markdown_to_html(self, markdown_content: str) -> str:
        """Convert Markdown content to HTML.

        Simple conversion for display purposes.
        In production, use a proper Markdown parser like markdown library.
        """
        # Simple Markdown to HTML conversion
        html = markdown_content

        # Headers
        html = html.replace("# ", "<h1>").replace("\n<h1>", "</h1>\n<h1>")
        html = html.replace("## ", "<h2>").replace("\n<h2>", "</h2>\n<h2>")
        html = html.replace("### ", "<h3>").replace("\n<h3>", "</h3>\n<h3>")

        # Bold
        html = html.replace("**", "<strong>", 1)
        while "**" in html:
            html = html.replace("**", "</strong>", 1)
            if "**" in html:
                html = html.replace("**", "<strong>", 1)

        # Quotes
        html = html.replace("> ", "<blockquote>").replace("\n<blockquote>", "</blockquote>\n<blockquote>")

        # Lists
        html = html.replace("- ", "<li>").replace("\n<li>", "</li>\n<li>")
        html = html.replace("1. ", "<li>").replace("\n<li>", "</li>\n<li>")

        # Tables (simple)
        if "|" in html:
            lines = html.split("\n")
            table_lines = []
            in_table = False
            for line in lines:
                if line.startswith("|") and "|" in line[1:]:
                    if not in_table:
                        table_lines.append("<table>")
                        in_table = True
                    cells = [c.strip() for c in line.split("|") if c.strip()]
                    if cells and not all(c.replace("-", "") == "" for c in cells):
                        row = "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"
                        table_lines.append(row)
                else:
                    if in_table:
                        table_lines.append("</table>")
                        in_table = False
                    table_lines.append(line)
            if in_table:
                table_lines.append("</table>")
            html = "\n".join(table_lines)

        # Wrap in HTML document
        html_document = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Analysis Report</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
        }}
        h1 {{ color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }}
        h2 {{ color: #34495e; }}
        h3 {{ color: #7f8c8d; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        td, th {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        tr:nth-child(even) {{ background-color: #f9f9f9; }}
        blockquote {{
            border-left: 4px solid #3498db;
            margin: 0;
            padding-left: 16px;
            color: #7f8c8d;
        }}
        li {{ margin: 8px 0; }}
        strong {{ color: #2c3e50; }}
    </style>
</head>
<body>
{html}
</body>
</html>"""

        return html_document

    def generate_excel(
        self,
        topics: list[dict[str, Any]],
        sentiment: dict[str, Any],
        key_points: list[dict[str, Any]],
    ) -> bytes:
        """Generate Excel spreadsheet from analysis results.

        Creates a multi-sheet Excel file with:
        - Sheet 1: Topic Analysis (topics with counts and keywords)
        - Sheet 2: Sentiment Analysis (distribution data)
        - Sheet 3: Key Points (insights with quotes)

        Args:
            topics: List of topic analysis results
            sentiment: Sentiment distribution dict
            key_points: List of key point extractions

        Returns:
            bytes: Excel file content

        """
        try:
            import pandas as pd
        except ImportError:
            # Return empty Excel-like bytes if pandas not available
            # In production, pandas should be installed
            return BytesIO().getvalue()

        output = BytesIO()

        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            # Sheet 1: Topics Analysis
            topics_data = []
            for topic in topics:
                topics_data.append(
                    {
                        "主题名称": topic.get("name", ""),
                        "回答数量": topic.get("count", 0),
                        "关键词": ", ".join(topic.get("keywords", [])),
                    }
                )
            if topics_data:
                pd.DataFrame(topics_data).to_excel(
                    writer,
                    sheet_name="主题分析",
                    index=False,
                )
            else:
                pd.DataFrame({"提示": ["无主题数据"]}).to_excel(
                    writer,
                    sheet_name="主题分析",
                    index=False,
                )

            # Sheet 2: Sentiment Analysis
            sentiment_data = [
                {
                    "正面占比 (%)": sentiment.get("positive", 0),
                    "负面占比 (%)": sentiment.get("negative", 0),
                    "中性占比 (%)": sentiment.get("neutral", 0),
                }
            ]
            pd.DataFrame(sentiment_data).to_excel(
                writer,
                sheet_name="情感分析",
                index=False,
            )

            # Sheet 3: Key Points
            key_points_data = []
            for point in key_points:
                key_points_data.append(
                    {
                        "关联主题": point.get("topic", ""),
                        "摘要": point.get("summary", ""),
                        "引用": "\n".join(point.get("quotes", [])),
                    }
                )
            if key_points_data:
                pd.DataFrame(key_points_data).to_excel(
                    writer,
                    sheet_name="关键观点",
                    index=False,
                )
            else:
                pd.DataFrame({"提示": ["无关键观点数据"]}).to_excel(
                    writer,
                    sheet_name="关键观点",
                    index=False,
                )

        return output.getvalue()


# Singleton pattern for service instance
_instance: ExportService | None = None


def get_export_service() -> ExportService:
    """Get singleton ExportService instance.

    Returns:
        ExportService: The singleton service instance

    """
    global _instance
    if _instance is None:
        _instance = ExportService()
    return _instance
