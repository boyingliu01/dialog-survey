"""
Tests for analysis prompt templates.
Following TDD: Write tests FIRST before implementation.
"""

import pytest


class TestAnalysisPrompts:
    """Tests for analysis prompt templates."""

    def test_topic_extraction_prompt_exists(self):
        """Test TOPIC_EXTRACTION_PROMPT is defined."""
        # This test will FAIL initially (RED phase)
        # because the module doesn't exist yet
        from src.services.analysis_prompts import TOPIC_EXTRACTION_PROMPT

        assert TOPIC_EXTRACTION_PROMPT is not None
        assert len(TOPIC_EXTRACTION_PROMPT) > 0

    def test_topic_extraction_prompt_has_placeholders(self):
        """Test TOPIC_EXTRACTION_PROMPT has required placeholders."""
        from src.services.analysis_prompts import TOPIC_EXTRACTION_PROMPT

        assert "{count}" in TOPIC_EXTRACTION_PROMPT
        assert "{contents}" in TOPIC_EXTRACTION_PROMPT

    def test_topic_extraction_prompt_specifies_json_format(self):
        """Test TOPIC_EXTRACTION_PROMPT specifies JSON output format."""
        from src.services.analysis_prompts import TOPIC_EXTRACTION_PROMPT

        assert "JSON" in TOPIC_EXTRACTION_PROMPT or "json" in TOPIC_EXTRACTION_PROMPT
        assert "topics" in TOPIC_EXTRACTION_PROMPT

    def test_sentiment_analysis_prompt_exists(self):
        """Test SENTIMENT_ANALYSIS_PROMPT is defined."""
        from src.services.analysis_prompts import SENTIMENT_ANALYSIS_PROMPT

        assert SENTIMENT_ANALYSIS_PROMPT is not None
        assert len(SENTIMENT_ANALYSIS_PROMPT) > 0

    def test_sentiment_prompt_has_placeholders(self):
        """Test SENTIMENT_ANALYSIS_PROMPT has required placeholders."""
        from src.services.analysis_prompts import SENTIMENT_ANALYSIS_PROMPT

        assert "{content}" in SENTIMENT_ANALYSIS_PROMPT

    def test_sentiment_prompt_returns_json_format(self):
        """Test SENTIMENT_ANALYSIS_PROMPT specifies JSON output format."""
        from src.services.analysis_prompts import SENTIMENT_ANALYSIS_PROMPT

        assert "JSON" in SENTIMENT_ANALYSIS_PROMPT or "json" in SENTIMENT_ANALYSIS_PROMPT
        assert "sentiment" in SENTIMENT_ANALYSIS_PROMPT
        assert "strength" in SENTIMENT_ANALYSIS_PROMPT

    def test_key_point_extraction_prompt_exists(self):
        """Test KEY_POINT_EXTRACTION_PROMPT is defined."""
        from src.services.analysis_prompts import KEY_POINT_EXTRACTION_PROMPT

        assert KEY_POINT_EXTRACTION_PROMPT is not None
        assert len(KEY_POINT_EXTRACTION_PROMPT) > 0

    def test_key_point_prompt_has_placeholders(self):
        """Test KEY_POINT_EXTRACTION_PROMPT has required placeholders."""
        from src.services.analysis_prompts import KEY_POINT_EXTRACTION_PROMPT

        assert "{topic_name}" in KEY_POINT_EXTRACTION_PROMPT
        assert "{content}" in KEY_POINT_EXTRACTION_PROMPT

    def test_key_point_prompt_returns_json_format(self):
        """Test KEY_POINT_EXTRACTION_PROMPT specifies JSON output format."""
        from src.services.analysis_prompts import KEY_POINT_EXTRACTION_PROMPT

        assert "JSON" in KEY_POINT_EXTRACTION_PROMPT or "json" in KEY_POINT_EXTRACTION_PROMPT
        assert "points" in KEY_POINT_EXTRACTION_PROMPT
        assert "summary" in KEY_POINT_EXTRACTION_PROMPT
        assert "quote" in KEY_POINT_EXTRACTION_PROMPT

    def test_analysis_report_prompt_exists(self):
        """Test ANALYSIS_REPORT_PROMPT is defined."""
        from src.services.analysis_prompts import ANALYSIS_REPORT_PROMPT

        assert ANALYSIS_REPORT_PROMPT is not None
        assert len(ANALYSIS_REPORT_PROMPT) > 0

    def test_analysis_report_prompt_has_placeholders(self):
        """Test ANALYSIS_REPORT_PROMPT has required placeholders."""
        from src.services.analysis_prompts import ANALYSIS_REPORT_PROMPT

        assert "{total_interviews}" in ANALYSIS_REPORT_PROMPT
        assert "{topics}" in ANALYSIS_REPORT_PROMPT
        assert "{sentiment_distribution}" in ANALYSIS_REPORT_PROMPT
        assert "{key_points}" in ANALYSIS_REPORT_PROMPT
        assert "{satisfaction_score}" in ANALYSIS_REPORT_PROMPT

    def test_analysis_report_prompt_specifies_markdown_format(self):
        """Test ANALYSIS_REPORT_PROMPT specifies Markdown output format."""
        from src.services.analysis_prompts import ANALYSIS_REPORT_PROMPT

        assert "Markdown" in ANALYSIS_REPORT_PROMPT or "markdown" in ANALYSIS_REPORT_PROMPT
        assert "执行摘要" in ANALYSIS_REPORT_PROMPT or "摘要" in ANALYSIS_REPORT_PROMPT
        assert "改进建议" in ANALYSIS_REPORT_PROMPT or "建议" in ANALYSIS_REPORT_PROMPT


class TestPromptFormatting:
    """Tests for prompt template formatting."""

    def test_topic_extraction_prompt_format(self):
        """Test TOPIC_EXTRACTION_PROMPT can be formatted."""
        from src.services.analysis_prompts import TOPIC_EXTRACTION_PROMPT

        formatted = TOPIC_EXTRACTION_PROMPT.format(count=10, contents="测试内容1\n测试内容2")

        assert "10 段回答" in formatted
        assert "测试内容" in formatted

    def test_sentiment_prompt_format(self):
        """Test SENTIMENT_ANALYSIS_PROMPT can be formatted."""
        from src.services.analysis_prompts import SENTIMENT_ANALYSIS_PROMPT

        formatted = SENTIMENT_ANALYSIS_PROMPT.format(content="这是一个正面评价")

        assert "这是一个正面评价" in formatted

    def test_key_point_prompt_format(self):
        """Test KEY_POINT_EXTRACTION_PROMPT can be formatted."""
        from src.services.analysis_prompts import KEY_POINT_EXTRACTION_PROMPT

        formatted = KEY_POINT_EXTRACTION_PROMPT.format(topic_name="产品质量", content="我觉得产品质量还不错")

        assert "产品质量" in formatted
        assert "我觉得产品质量还不错" in formatted

    def test_analysis_report_prompt_format(self):
        """Test ANALYSIS_REPORT_PROMPT can be formatted."""
        from src.services.analysis_prompts import ANALYSIS_REPORT_PROMPT

        formatted = ANALYSIS_REPORT_PROMPT.format(
            total_interviews=50,
            topics="产品质量, 服务体验",
            sentiment_distribution="正面60%, 负面30%, 中性10%",
            key_points="质量需改进, 服务响应慢",
            satisfaction_score=75,
        )

        assert "50" in formatted
        assert "产品质量" in formatted
        assert "75" in formatted
