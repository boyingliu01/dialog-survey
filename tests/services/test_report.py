"""
Tests for structured report generation (FR-003 AC-002).
TDD: Tests written BEFORE implementation.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.services.llm import LLMService


class TestReportTemplateStructure:
    """Tests for report template having all required sections."""

    def test_report_generate_prompt_v2_exists(self):
        """Test REPORT_GENERATE_PROMPT_V2 is defined."""
        from src.services.prompts import REPORT_GENERATE_PROMPT_V2

        assert REPORT_GENERATE_PROMPT_V2 is not None
        assert len(REPORT_GENERATE_PROMPT_V2) > 0

    def test_report_generate_prompt_v2_has_all_required_sections(self):
        """Test V2 prompt has all required section placeholders."""
        from src.services.prompts import REPORT_GENERATE_PROMPT_V2

        # Required sections in Chinese
        required_sections = [
            "访谈概览",
            "关键发现",
            "情绪分析",
            "改进建议",
            "原始对话摘要",
        ]

        for section in required_sections:
            assert section in REPORT_GENERATE_PROMPT_V2, f"Missing section: {section}"

    def test_report_generate_prompt_v2_has_overview_fields(self):
        """Test V2 prompt has overview section fields."""
        from src.services.prompts import REPORT_GENERATE_PROMPT_V2

        # Overview should have topic, duration, quality_score
        overview_fields = ["访谈主题", "访谈时长", "回答质量评分"]

        for field in overview_fields:
            assert field in REPORT_GENERATE_PROMPT_V2, f"Missing overview field: {field}"

    def test_report_generate_prompt_v2_has_sentiment_fields(self):
        """Test V2 prompt has sentiment analysis section fields."""
        from src.services.prompts import REPORT_GENERATE_PROMPT_V2

        # Sentiment should have overall, positive/negative ratio
        sentiment_fields = ["整体情绪倾向", "正面反馈占比", "负面反馈占比"]

        for field in sentiment_fields:
            assert field in REPORT_GENERATE_PROMPT_V2, f"Missing sentiment field: {field}"

    def test_report_generate_prompt_v2_has_placeholders(self):
        """Test V2 prompt has all required placeholders."""
        from src.services.prompts import REPORT_GENERATE_PROMPT_V2

        required_placeholders = [
            "{topic}",
            "{topics}",
            "{conversation_history}",
            "{duration}",
            "{quality_score}",
        ]

        for placeholder in required_placeholders:
            assert placeholder in REPORT_GENERATE_PROMPT_V2, f"Missing placeholder: {placeholder}"


class TestReportContainsKeyFindings:
    """Tests for key findings section in generated report."""

    @patch("src.services.llm.load_dotenv")
    def test_generate_report_v2_returns_key_findings(self, mock_dotenv, monkeypatch):
        """Test generated report contains key findings section."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        # Mock response with key findings section
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 1. 访谈概览
- 访谈主题：产品质量调研
- 访谈时长：约 15 分钟
- 回答质量评分：8/10

## 2. 关键发现
- 用户对产品整体满意度较高
- 主要关注点在于价格和售后服务
- 希望增加更多功能选项

## 3. 情绪分析
- 整体情绪倾向：正面
- 正面反馈占比：70%
- 负面反馈占比：20%

## 4. 改进建议
1. 优化售后服务流程
2. 提供更多价格选择
3. 增加用户反馈渠道

## 5. 原始对话摘要
本次访谈主要围绕产品质量进行讨论...
"""

        history = [
            {"role": "assistant", "content": "您好，请问对产品有什么看法？"},
            {"role": "user", "content": "产品很好，但价格偏高"},
        ]
        topics = [{"name": "产品质量", "description": "用户对产品质量的评价"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "产品质量调研")

        assert "关键发现" in result

    @patch("src.services.llm.load_dotenv")
    def test_key_findings_has_bullet_points(self, mock_dotenv, monkeypatch):
        """Test key findings section has bullet point format."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 2. 关键发现
- 发现1：用户满意度
- 发现2：价格关注
- 发现3：功能需求
"""

        history = [{"role": "user", "content": "测试"}]
        topics = [{"name": "测试", "description": "测试"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "测试")

        # Check for bullet point format (dash + space)
        assert "- " in result or "• " in result


class TestSentimentAnalysisInReport:
    """Tests for sentiment analysis section in generated report."""

    @patch("src.services.llm.load_dotenv")
    def test_generate_report_v2_returns_sentiment_analysis(self, mock_dotenv, monkeypatch):
        """Test generated report contains sentiment analysis section."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 3. 情绪分析
- 整体情绪倾向：正面偏中性
- 正面反馈占比：65%
- 负面反馈占比：15%
"""

        history = [{"role": "user", "content": "测试"}]
        topics = [{"name": "测试", "description": "测试"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "测试")

        assert "情绪分析" in result

    @patch("src.services.llm.load_dotenv")
    def test_sentiment_has_percentage_format(self, mock_dotenv, monkeypatch):
        """Test sentiment percentages are present in report."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 3. 情绪分析
- 整体情绪倾向：正面
- 正面反馈占比：70%
- 负面反馈占比：20%
"""

        history = [{"role": "user", "content": "测试"}]
        topics = [{"name": "测试", "description": "测试"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "测试")

        # Check percentage format (number followed by %)
        assert "%" in result
        # Should have at least two percentages
        percentage_count = result.count("%")
        assert percentage_count >= 2


class TestActionItemsInReport:
    """Tests for action items/improvement suggestions section."""

    @patch("src.services.llm.load_dotenv")
    def test_generate_report_v2_returns_action_items(self, mock_dotenv, monkeypatch):
        """Test generated report contains action items section."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 4. 改进建议
1. 优化售后服务流程
2. 提供更多价格选择
3. 增加用户反馈渠道
"""

        history = [{"role": "user", "content": "测试"}]
        topics = [{"name": "测试", "description": "测试"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "测试")

        assert "改进建议" in result

    @patch("src.services.llm.load_dotenv")
    def test_action_items_are_numbered(self, mock_dotenv, monkeypatch):
        """Test action items have numbered list format."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 4. 改进建议
1. 第一个建议
2. 第二个建议
3. 第三个建议
"""

        history = [{"role": "user", "content": "测试"}]
        topics = [{"name": "测试", "description": "测试"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "测试")

        # Should have numbered format
        assert "1." in result or "1、" in result


class TestFullReportGeneration:
    """Integration tests for complete structured report generation."""

    @patch("src.services.llm.load_dotenv")
    def test_full_report_has_all_five_sections(self, mock_dotenv, monkeypatch):
        """Test full report contains all five required sections."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 1. 访谈概览
- 访谈主题：产品质量调研
- 访谈时长：约 20 分钟
- 回答质量评分：8/10

## 2. 关键发现
- 发现1：用户满意度高
- 发现2：价格敏感

## 3. 情绪分析
- 整体情绪倾向：正面
- 正面反馈占比：70%
- 负面反馈占比：20%

## 4. 改进建议
1. 优化价格策略
2. 提升服务体验

## 5. 原始对话摘要
本次访谈围绕产品质量展开...
"""

        history = [
            {"role": "assistant", "content": "您好"},
            {"role": "user", "content": "产品不错"},
        ]
        topics = [{"name": "产品质量", "description": "评价"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "产品质量调研")

        required_sections = [
            "访谈概览",
            "关键发现",
            "情绪分析",
            "改进建议",
            "原始对话摘要",
        ]

        for section in required_sections:
            assert section in result, f"Missing section: {section}"

    @patch("src.services.llm.load_dotenv")
    def test_report_markdown_format(self, mock_dotenv, monkeypatch):
        """Test report follows markdown format with headers."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 1. 访谈概览
内容

## 2. 关键发现
内容

## 3. 绪分析
内容

## 4. 改进建议
内容

## 5. 原始对话摘要
内容
"""

        history = [{"role": "user", "content": "测试"}]
        topics = [{"name": "测试", "description": "测试"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "测试")

        # Check markdown headers
        assert "# " in result  # Main header
        assert "## " in result  # Section headers

    @patch("src.services.llm.load_dotenv")
    def test_report_with_realistic_data(self, mock_dotenv, monkeypatch):
        """Test report generation with realistic interview data."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        # Realistic interview conversation
        history = [
            {"role": "assistant", "content": "您好，感谢您参加今天的访谈。我们想了解一下您对我们产品的看法。"},
            {"role": "user", "content": "好的，我很乐意分享我的体验。"},
            {"role": "assistant", "content": "那我们先从整体质量说起，您对我们的产品整体感觉怎么样？"},
            {"role": "user", "content": "整体来说还不错，质量挺好的，使用起来也比较方便。不过我觉得价格有点偏高。"},
            {"role": "assistant", "content": "您提到价格偏高，能具体说说吗？您觉得什么价位会比较合适？"},
            {"role": "user", "content": "我觉得如果能便宜20%左右会更合理，现在的价格对普通消费者来说有点压力。"},
        ]

        topics = [
            {"name": "产品质量", "description": "用户对产品质量的整体评价"},
            {"name": "价格感知", "description": "用户对产品价格的看法"},
        ]

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = """# 访谈报告

## 1. 访谈概览
- 访谈主题：产品质量调研
- 访谈时长：约 10 分钟
- 回答质量评分：9/10

## 2. 关键发现
- 产品质量获得用户认可，整体满意度较高
- 价格问题是主要关注点，用户期望降价20%
- 产品使用便捷性是正面反馈点

## 3. 情绪分析
- 整体情绪倾向：正面偏建议性
- 正面反馈占比：60%
- 负面反馈占比：20%

## 4. 改进建议
1. 调整价格策略，考虑推出促销活动或阶梯定价
2. 继续保持产品质量优势
3. 加强性价比宣传，提升用户价值感知

## 5. 原始对话摘要
本次访谈围绕产品质量和价格展开，用户对产品质量表示满意，但认为价格偏高，建议降价20%以提升性价比。整体态度友好，愿意分享真实体验。
"""

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "产品质量调研")

        assert isinstance(result, str)
        assert len(result) > 100  # Should have substantial content


class TestBackwardCompatibility:
    """Tests to ensure backward compatibility with existing report generation."""

    def test_old_prompt_still_exists(self):
        """Test old REPORT_GENERATE_PROMPT still exists for fallback."""
        from src.services.prompts import REPORT_GENERATE_PROMPT

        assert REPORT_GENERATE_PROMPT is not None
        assert "{topic}" in REPORT_GENERATE_PROMPT
        assert "{topics}" in REPORT_GENERATE_PROMPT
        assert "{conversation_history}" in REPORT_GENERATE_PROMPT

    @patch("src.services.llm.load_dotenv")
    def test_generate_report_still_works_with_basic_params(self, mock_dotenv, monkeypatch):
        """Test generate_report works with same parameters as before."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "# 报告内容"

        history = [{"role": "user", "content": "回答"}]
        topics = [{"name": "话题", "description": "描述"}]

        # Same signature as before
        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(
                conversation_history=history,
                topics=topics,
                topic="测试主题",
            )

        assert isinstance(result, str)
