"""
Analysis service for interview content analysis.

Provides methods for:
- Topic extraction (clustering)
- Sentiment analysis
- Key point extraction
- Batch processing for large datasets
"""

import json
from typing import Any

from dotenv import load_dotenv

from .analysis_prompts import (
    KEY_POINT_EXTRACTION_PROMPT,
    SENTIMENT_ANALYSIS_PROMPT,
    TOPIC_EXTRACTION_PROMPT,
)
from .llm import get_llm_service

load_dotenv()


class AnalysisService:
    """访谈统计分析服务

    提供访谈内容的主题聚类、情感分析、关键观点提取等功能。
    支持大批量数据的分批处理。
    """

    BATCH_SIZE = 50  # 每批处理50个访谈

    def __init__(self):
        """初始化分析服务."""
        self.llm_service = get_llm_service()

    def extract_topics(self, contents: list[str]) -> list[dict[str, Any]]:
        """主题聚类 - 从访谈内容中提取主要讨论主题.

        Args:
            contents: 访谈回答内容列表

        Returns:
            主题列表，每个主题包含 name, keywords, mentions

        Example:
            >>> topics = service.extract_topics(["产品质量还不错", "用户体验一般"])
            >>> topics[0]["name"]  # "产品质量"
        """
        if not contents:
            return []

        # 分批处理，合并结果
        batches = self._split_into_batches(contents)
        all_topics = []

        for batch in batches:
            # 格式化内容
            formatted_contents = "\n\n".join([f"回答{i + 1}: {content}" for i, content in enumerate(batch)])

            # 构建提示词
            prompt = TOPIC_EXTRACTION_PROMPT.format(count=len(batch), contents=formatted_contents)

            # 调用 LLM
            try:
                response = self.llm_service.chat(messages=[{"role": "user", "content": prompt}], temperature=0.3)

                # 解析 JSON 响应
                result = self._parse_json_response(response)

                if result and "topics" in result:
                    all_topics.extend(result["topics"])
            except Exception as e:
                print(f"主题提取失败: {e}")
                continue

        # 合并相似主题（简单去重）
        return self._merge_topics(all_topics)

    def analyze_sentiment(self, content: str) -> dict[str, Any]:
        """情感分析 - 分析单个回答的情感倾向.

        Args:
            content: 单个回答内容

        Returns:
            情感分析结果，包含 sentiment, strength, keywords

        Example:
            >>> sentiment = service.analyze_sentiment("我觉得产品质量还不错")
            >>> sentiment["sentiment"]  # "positive"
        """
        if not content or len(content.strip()) == 0:
            return {"sentiment": "neutral", "strength": "weak", "keywords": []}

        # 构建提示词
        prompt = SENTIMENT_ANALYSIS_PROMPT.format(content=content)

        # 调用 LLM
        try:
            response = self.llm_service.chat(messages=[{"role": "user", "content": prompt}], temperature=0.3)

            # 解析 JSON 响应
            result = self._parse_json_response(response)

            if result:
                return {
                    "sentiment": result.get("sentiment", "neutral"),
                    "strength": result.get("strength", "weak"),
                    "keywords": result.get("keywords", []),
                }
        except Exception as e:
            print(f"情感分析失败: {e}")

        # 返回默认结果
        return {"sentiment": "neutral", "strength": "weak", "keywords": []}

    def extract_key_points(self, topic: str, content: str) -> list[dict[str, Any]]:
        """关键观点提取 - 从回答中提取与特定主题相关的关键观点.

        Args:
            topic: 主题名称
            content: 回答内容

        Returns:
            关键观点列表，每个观点包含 summary, quote, sentiment

        Example:
            >>> points = service.extract_key_points("产品质量", "我觉得产品质量还不错")
            >>> points[0]["summary"]  # "产品质量有提升空间"
        """
        if not content or len(content.strip()) == 0:
            return []

        # 构建提示词
        prompt = KEY_POINT_EXTRACTION_PROMPT.format(topic_name=topic, content=content)

        # 调用 LLM
        try:
            response = self.llm_service.chat(messages=[{"role": "user", "content": prompt}], temperature=0.3)

            # 解析 JSON 响应
            result = self._parse_json_response(response)

            if result and "points" in result:
                return result["points"]
        except Exception as e:
            print(f"关键观点提取失败: {e}")

        return []

    def _split_into_batches(self, items: list[Any], batch_size: int | None = None) -> list[list[Any]]:
        """将列表分割成批次.

        Args:
            items: 待分割的列表
            batch_size: 每批大小（默认使用 BATCH_SIZE）

        Returns:
            分批后的列表
        """
        batch_size = batch_size or self.BATCH_SIZE

        if not items:
            return []

        return [items[i : i + batch_size] for i in range(0, len(items), batch_size)]

    def _parse_json_response(self, response: str) -> dict[str, Any] | None:
        """解析 LLM 返回的 JSON 响应.

        Args:
            response: LLM 返回的文本

        Returns:
            解析后的字典，如果解析失败返回 None
        """
        try:
            # 尝试直接解析
            return json.loads(response)
        except json.JSONDecodeError:
            # 尝试提取 JSON 部分
            try:
                # 查找 JSON 结构
                start = response.find("{")
                end = response.rfind("}") + 1

                if start >= 0 and end > start:
                    json_str = response[start:end]
                    return json.loads(json_str)
            except (json.JSONDecodeError, ValueError):
                pass

        return None

    def _merge_topics(self, topics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """合并相似主题.

        Args:
            topics: 原始主题列表

        Returns:
            合并后的主题列表（简单去重）
        """
        if not topics:
            return []

        # 使用名称去重（保留第一次出现的主题）
        seen_names = set()
        merged = []

        for topic in topics:
            name = topic.get("name", "")
            if name and name not in seen_names:
                seen_names.add(name)
                merged.append(topic)

        return merged


# Singleton instance
_analysis_service: AnalysisService | None = None


def get_analysis_service() -> AnalysisService:
    """Get singleton AnalysisService instance.

    Returns:
        AnalysisService 单例实例
    """
    global _analysis_service
    if _analysis_service is None:
        _analysis_service = AnalysisService()
    return _analysis_service
