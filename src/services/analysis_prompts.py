"""Analysis prompts for interview content analysis.

Provides LLM prompt templates for:
- Topic extraction (clustering)
- Sentiment analysis
- Key point extraction
- Analysis report generation
"""

# Topic extraction prompt - extract main discussion topics from interview contents
TOPIC_EXTRACTION_PROMPT = """你是一个专业的访谈分析师。请分析以下访谈内容，提取主要讨论主题。

访谈内容（{count} 段回答）：
{contents}

分析要求：
1. 提取 5-10 个主要讨论主题
2. 每个主题标注：主题名称、关键词、提及次数
3. 返回 JSON 格式：
{{
  "topics": [
    {{"name": "产品质量", "keywords": ["质量", "bug", "稳定性"], "mentions": 15}},
    {{"name": "用户体验", "keywords": ["体验", "流畅", "易用"], "mentions": 10}},
    {{"name": "功能完整性", "keywords": ["功能", "完整性", "缺失"], "mentions": 8}}
  ]
}}

请直接返回 JSON 格式的结果，不要添加其他解释。
"""

# Sentiment analysis prompt - analyze sentiment of single response
SENTIMENT_ANALYSIS_PROMPT = """分析以下访谈回答的情感倾向。

回答内容：
{content}

要求：
1. 判断情感倾向：positive / negative / neutral
2. 分析情感强度：strong / moderate / weak
3. 提取情感关键词（至少3个）
4. 返回 JSON 格式：
{{
  "sentiment": "positive",
  "strength": "moderate",
  "keywords": ["满意", "好", "认可"]
}}

请直接返回 JSON 格式的结果，不要添加其他解释。
"""

# Key point extraction prompt - extract key points related to specific topic
KEY_POINT_EXTRACTION_PROMPT = """从以下访谈回答中提取关键观点，要求与主题 "{topic_name}" 相关。

回答内容：
{content}

要求：
1. 提取 1-3 个核心观点
2. 每个观点需包含：
   - 观点摘要（简洁总结，不超过50字）
   - 原文引用（回答中的关键句子）
   - 情感倾向（positive/negative/neutral）
3. 返回 JSON 格式：
{{
  "points": [
    {{
      "summary": "产品质量有提升空间",
      "quote": "我觉得产品的稳定性还需要加强...",
      "sentiment": "negative"
    }},
    {{
      "summary": "整体功能较完善",
      "quote": "功能基本都能满足日常需求",
      "sentiment": "positive"
    }}
  ]
}}

请直接返回 JSON 格式的结果，不要添加其他解释。
"""

# Analysis report generation prompt - generate comprehensive analysis report
ANALYSIS_REPORT_PROMPT = """基于以下分析数据，生成访谈分析报告。

分析数据：
- 总访谈数：{total_interviews}
- 主要主题：{topics}
- 整体情感分布：{sentiment_distribution}
- 关键观点：{key_points}
- 满意度得分：{satisfaction_score}

生成 Markdown 格式报告，包含以下章节：

# 访谈分析报告

## 1. 执行摘要
简要概述本次访谈的核心发现和关键洞察。

## 2. 主题分析
分析各主要主题的讨论情况：
- 各主题的提及频率
- 用户关注的核心问题
- 主题间的关联性

## 3. 情感分析
分析整体情感倾向：
- 正面、负面、中性的分布比例
- 典型正面/负面反馈案例
- 情感变化趋势

## 4. 关键发现
列出最重要的发现（3-5条）：
- 每条发现需有具体证据支持
- 标注发现的优先级（高/中/低）

## 5. 改进建议
基于访谈内容提出具体改进建议：
- 每条建议需可执行、可衡量
- 标注建议的优先级和预期效果

---
请严格按照上述格式生成报告，确保内容详实、分析深入。
"""
