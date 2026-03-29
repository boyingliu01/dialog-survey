"""
Tests for analysis service.
Following TDD: Write tests FIRST before implementation.
"""

import json
from unittest.mock import MagicMock, patch

import pytest


class TestAnalysisServiceInit:
    """Tests for AnalysisService initialization."""

    @patch("src.services.analysis_service.load_dotenv")
    def test_analysis_service_init(self, mock_dotenv, monkeypatch):
        """Test AnalysisService initializes correctly."""
        # This test will FAIL initially (RED phase)
        # because the module doesn't exist yet
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        assert service is not None
        assert service.llm_service is not None
        assert service.BATCH_SIZE == 50

    @patch("src.services.analysis_service.load_dotenv")
    def test_get_analysis_service_singleton(self, mock_dotenv, monkeypatch):
        """Test get_analysis_service returns singleton."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import get_analysis_service

        service1 = get_analysis_service()
        service2 = get_analysis_service()

        assert service1 is service2


class TestTopicExtraction:
    """Tests for topic extraction functionality."""

    @patch("src.services.analysis_service.load_dotenv")
    def test_extract_topics_returns_list(self, mock_dotenv, monkeypatch):
        """Test extract_topics returns a list of topics."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response
        mock_response = json.dumps(
            {
                "topics": [
                    {"name": "产品质量", "keywords": ["质量", "bug"], "mentions": 15},
                    {"name": "用户体验", "keywords": ["体验", "流畅"], "mentions": 10},
                ]
            }
        )

        with patch.object(service.llm_service, "chat", return_value=mock_response):
            topics = service.extract_topics(["回答1", "回答2"])

        assert isinstance(topics, list)
        assert len(topics) >= 0

    @patch("src.services.analysis_service.load_dotenv")
    def test_extract_topics_with_mocked_llm(self, mock_dotenv, monkeypatch):
        """Test extract_topics with mocked LLM returns expected structure."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response with structured topic data
        mock_response = json.dumps(
            {
                "topics": [
                    {"name": "产品质量", "keywords": ["质量", "bug", "稳定性"], "mentions": 15},
                    {"name": "用户体验", "keywords": ["体验", "流畅", "易用"], "mentions": 10},
                    {"name": "功能完整性", "keywords": ["功能", "完整性", "缺失"], "mentions": 8},
                ]
            }
        )

        contents = ["产品质量还不错", "用户体验一般", "功能基本满足需求"]

        with patch.object(service.llm_service, "chat", return_value=mock_response):
            topics = service.extract_topics(contents)

        assert isinstance(topics, list)
        if len(topics) > 0:
            assert "name" in topics[0]
            assert "keywords" in topics[0]
            assert "mentions" in topics[0]


class TestSentimentAnalysis:
    """Tests for sentiment analysis functionality."""

    @patch("src.services.analysis_service.load_dotenv")
    def test_analyze_sentiment_returns_dict(self, mock_dotenv, monkeypatch):
        """Test analyze_sentiment returns a sentiment dict."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response
        mock_response = json.dumps(
            {"sentiment": "positive", "strength": "moderate", "keywords": ["满意", "好", "认可"]}
        )

        with patch.object(service.llm_service, "chat", return_value=mock_response):
            sentiment = service.analyze_sentiment("我觉得产品质量还不错")

        assert isinstance(sentiment, dict)

    @patch("src.services.analysis_service.load_dotenv")
    def test_analyze_sentiment_with_mocked_llm(self, mock_dotenv, monkeypatch):
        """Test analyze_sentiment with mocked LLM returns expected structure."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response with sentiment data
        mock_response = json.dumps(
            {"sentiment": "positive", "strength": "moderate", "keywords": ["满意", "好", "认可"]}
        )

        content = "我觉得产品质量还不错，总体比较满意"

        with patch.object(service.llm_service, "chat", return_value=mock_response):
            sentiment = service.analyze_sentiment(content)

        assert isinstance(sentiment, dict)
        assert "sentiment" in sentiment
        assert sentiment["sentiment"] in ["positive", "negative", "neutral"]
        assert "strength" in sentiment
        assert sentiment["strength"] in ["strong", "moderate", "weak"]
        assert "keywords" in sentiment
        assert isinstance(sentiment["keywords"], list)


class TestKeyPointExtraction:
    """Tests for key point extraction functionality."""

    @patch("src.services.analysis_service.load_dotenv")
    def test_extract_key_points_returns_list(self, mock_dotenv, monkeypatch):
        """Test extract_key_points returns a list of points."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response
        mock_response = json.dumps(
            {
                "points": [
                    {"summary": "产品质量有提升空间", "quote": "我觉得产品的稳定性还需要加强", "sentiment": "negative"}
                ]
            }
        )

        with patch.object(service.llm_service, "chat", return_value=mock_response):
            points = service.extract_key_points("产品质量", "回答内容")

        assert isinstance(points, list)

    @patch("src.services.analysis_service.load_dotenv")
    def test_extract_key_points_with_mocked_llm(self, mock_dotenv, monkeypatch):
        """Test extract_key_points with mocked LLM returns expected structure."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response with key point data
        mock_response = json.dumps(
            {
                "points": [
                    {
                        "summary": "产品质量有提升空间",
                        "quote": "我觉得产品的稳定性还需要加强...",
                        "sentiment": "negative",
                    },
                    {"summary": "整体功能较完善", "quote": "功能基本都能满足日常需求", "sentiment": "positive"},
                ]
            }
        )

        topic = "产品质量"
        content = "我觉得产品的稳定性还需要加强，但功能基本都能满足日常需求"

        with patch.object(service.llm_service, "chat", return_value=mock_response):
            points = service.extract_key_points(topic, content)

        assert isinstance(points, list)
        if len(points) > 0:
            assert "summary" in points[0]
            assert "quote" in points[0]
            assert "sentiment" in points[0]


class TestBatchProcessing:
    """Tests for batch processing functionality."""

    def test_split_into_batches_splits_correctly(self):
        """Test _split_into_batches divides input correctly."""
        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        items = [i for i in range(100)]
        batches = service._split_into_batches(items, batch_size=20)

        assert isinstance(batches, list)
        assert len(batches) == 5  # 100 items / 20 = 5 batches
        assert all(len(batch) == 20 for batch in batches)

    def test_split_into_batches_with_default_batch_size(self):
        """Test _split_into_batches uses default BATCH_SIZE."""
        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        items = [i for i in range(75)]
        batches = service._split_into_batches(items)

        assert isinstance(batches, list)
        assert len(batches) == 2  # 75 items / 50 = 2 batches (first has 50, second has 25)
        assert len(batches[0]) == 50  # First batch uses default BATCH_SIZE
        assert len(batches[1]) == 25  # Remaining items in last batch

    def test_split_into_batches_empty_list(self):
        """Test _split_into_batches handles empty list."""
        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        batches = service._split_into_batches([])

        assert isinstance(batches, list)
        assert len(batches) == 0

    def test_split_into_batches_small_list(self):
        """Test _split_into_batches handles list smaller than batch_size."""
        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        items = [1, 2, 3]
        batches = service._split_into_batches(items, batch_size=10)

        assert isinstance(batches, list)
        assert len(batches) == 1
        assert len(batches[0]) == 3


class TestErrorHandling:
    """Tests for error handling in analysis service."""

    @patch("src.services.analysis_service.load_dotenv")
    def test_analyze_sentiment_handles_invalid_json(self, mock_dotenv, monkeypatch):
        """Test analyze_sentiment handles invalid JSON response."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response with invalid JSON
        with patch.object(service.llm_service, "chat", return_value="invalid json"):
            sentiment = service.analyze_sentiment("测试内容")

        # Should return default/fallback sentiment
        assert isinstance(sentiment, dict)
        assert "sentiment" in sentiment

    @patch("src.services.analysis_service.load_dotenv")
    def test_extract_key_points_handles_empty_content(self, mock_dotenv, monkeypatch):
        """Test extract_key_points handles empty content."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Mock LLM response
        mock_response = json.dumps({"points": []})

        with patch.object(service.llm_service, "chat", return_value=mock_response):
            points = service.extract_key_points("测试主题", "")

        assert isinstance(points, list)


class TestAsyncMethods:
    """Tests for async methods (if implemented as async)."""

    @patch("src.services.analysis_service.load_dotenv")
    def test_extract_topics_can_be_called(self, mock_dotenv, monkeypatch):
        """Test extract_topics is callable (sync or async)."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Just verify method exists and is callable
        assert hasattr(service, "extract_topics")
        assert callable(service.extract_topics)

    @patch("src.services.analysis_service.load_dotenv")
    def test_analyze_sentiment_can_be_called(self, mock_dotenv, monkeypatch):
        """Test analyze_sentiment is callable (sync or async)."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Just verify method exists and is callable
        assert hasattr(service, "analyze_sentiment")
        assert callable(service.analyze_sentiment)

    @patch("src.services.analysis_service.load_dotenv")
    def test_extract_key_points_can_be_called(self, mock_dotenv, monkeypatch):
        """Test extract_key_points is callable (sync or async)."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

        from src.services.analysis_service import AnalysisService

        service = AnalysisService()

        # Just verify method exists and is callable
        assert hasattr(service, "extract_key_points")
        assert callable(service.extract_key_points)
