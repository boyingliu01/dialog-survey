"""
自动化测试用例 - 验证对话自然度和提示词可控性

测试目标：
1. 输出多样性 - 同一场景多次调用，输出不应重复
2. 提示词可控性 - 修改persona配置，输出风格应改变
3. 上下文连贯性 - 问题应基于对话历史生成
4. LLM调用验证 - 确保真正调用LLM，不走mock

注意：运行测试前需要配置有效的DASHSCOPE_API_KEY
"""

import asyncio

import pytest

from src.core.graph import run_interview
from src.services.llm import get_qwen_service
from src.services.prompts import build_system_prompt, get_persona_config


class TestOutputDiversity:
    """测试1: 输出多样性 - 验证LLM生成的问题不会重复"""

    @pytest.mark.asyncio
    async def test_opening_question_diversity(self):
        """开场问题应该各不相同"""
        llm = get_qwen_service()
        persona = get_persona_config("friendly_researcher")

        responses = []
        for _ in range(5):
            response = await asyncio.to_thread(
                llm.generate_opening_question,
                topic_name="产品访谈",
                topic_description="了解用户对产品的看法",
                first_topic="产品质量",
                persona_config=persona,
            )
            responses.append(response)

        # 5次回复中至少4个不同（允许偶尔的偶然重复）
        unique_count = len(set(responses))
        assert unique_count >= 4, (
            f"开场问题重复率过高！只生成{unique_count}种不同的问题"
        )

        # 每个回复应该包含"产品"或"质量"等关键词
        for r in responses:
            assert any(kw in r.lower() for kw in ["产品", "质量", "使用", "体验"]), (
                f"回复偏离主题: {r[:50]}..."
            )

    @pytest.mark.asyncio
    async def test_followup_question_diversity(self):
        """追问问题应该根据用户回答动态生成"""
        llm = get_qwen_service()

        # 不同的用户回答应该产生不同的追问
        user_answers = [
            "挺好的，没什么问题",
            "功能很强大，但是界面有点复杂",
            "速度快，但是偶尔会有bug",
            "整体满意，但是希望能增加导出功能",
            "性价比很高，推荐朋友使用",
        ]

        responses = []
        for answer in user_answers:
            response = await asyncio.to_thread(
                llm.generate_followup,
                user_answer=answer,
                followup_type="deep",
                domain_context="产品质量访谈",
            )
            responses.append(response)

        # 5个不同回答产生的追问应该各不相同
        unique_count = len(set(responses))
        assert unique_count == 5, (
            f"追问没有根据上下文变化！只有{unique_count}种不同追问"
        )

        # 追问应该提到用户回答中的内容
        for i, (answer, question) in enumerate(zip(user_answers, responses)):
            # 追问应该具体，不是泛泛而谈
            assert len(question) > 15, f"追问{i + 1}太短，不够具体: {question}"


class TestPersonaControllability:
    """测试2: 提示词可控性 - 修改配置后输出应改变"""

    @pytest.mark.asyncio
    async def test_different_personas_produce_different_outputs(self):
        """不同persona应该产生不同风格的回复"""
        llm = get_qwen_service()

        personas = {
            "formal": {
                "role_name": "专业咨询顾问",
                "personality": "严谨、专业、注重数据",
                "conversation_style": "正式的商务访谈",
                "tone": "专业、礼貌",
                "topic_name": "产品评估",
                "topic_scope": "产品功能、性能、用户体验",
            },
            "casual": {
                "role_name": "产品经理",
                "personality": "热情、好奇、善于倾听",
                "conversation_style": "轻松随意的聊天",
                "tone": "友好、热情",
                "topic_name": "产品使用感受",
                "topic_scope": "产品体验、改进建议",
            },
        }

        responses = {}
        for name, persona in personas.items():
            response = await asyncio.to_thread(
                llm.generate_opening_question,
                topic_name="产品访谈",
                topic_description="了解用户反馈",
                first_topic="产品体验",
                persona_config=persona,
            )
            responses[name] = response

        # 两种风格的回复应该不同
        assert responses["formal"] != responses["casual"], (
            "不同persona产生了相同的回复！提示词控制无效"
        )

        # 正式风格应该更严谨（可能包含"请"、"您"等礼貌用语）
        formal = responses["formal"].lower()
        casual = responses["casual"].lower()

        formal_indicators = ["请", "您", "方便", "请问"]
        casual_indicators = ["呀", "呢", "吧", "～", "!"]

        formal_score = sum(1 for w in formal_indicators if w in formal)
        casual_score = sum(1 for w in casual_indicators if w in casual)

        # 至少有一种风格特征
        assert formal_score > 0 or casual_score > 0, (
            f"无法区分正式/轻松风格。正式: {responses['formal'][:50]}... 轻松: {responses['casual'][:50]}..."
        )

    @pytest.mark.asyncio
    async def test_system_prompt_affects_output(self):
        """系统提示词应该影响LLM输出"""
        llm = get_qwen_service()

        # 专业风格提示词
        professional_prompt = build_system_prompt(
            role_name="资深研究员",
            personality="专业严谨",
            conversation_style="深度访谈",
            tone="正式",
            topic_name="产品研究",
            topic_scope="产品功能",
        )

        # 轻松风格提示词
        casual_prompt = build_system_prompt(
            role_name="产品爱好者",
            personality="热情开朗",
            conversation_style="轻松聊天",
            tone="随意",
            topic_name="产品体验",
            topic_scope="使用感受",
        )

        # 相同用户消息，不同系统提示词
        messages = [{"role": "user", "content": "你对这个产品的看法？"}]

        response1 = await asyncio.to_thread(
            llm.chat, messages, system_prompt=professional_prompt, temperature=0.7
        )
        response2 = await asyncio.to_thread(
            llm.chat, messages, system_prompt=casual_prompt, temperature=0.7
        )

        assert response1 != response2, "不同系统提示词产生了相同回复！提示词控制无效"


class TestContextAwareness:
    """测试3: 上下文连贯性 - 问题应基于对话历史"""

    @pytest.mark.asyncio
    async def test_next_question_considers_conversation_history(self):
        """下一个问题应该基于之前的对话"""
        llm = get_qwen_service()
        persona = get_persona_config("friendly_researcher")

        # 场景1: 用户提到喜欢某个功能
        history1 = [
            {"role": "assistant", "content": "你喜欢产品的哪个功能？"},
            {"role": "user", "content": "我最喜欢自动保存功能，很省心"},
        ]

        question1 = await asyncio.to_thread(
            llm.generate_next_question_enhanced,
            conversation_history=history1,
            current_topic="功能使用",
            topic_description="了解功能使用频率和满意度",
            current_topic_index=0,
            total_topics=3,
            extracted_info={},
            persona_config=persona,
        )

        # 问题应该提到"自动保存"或相关
        assert any(
            kw in question1.lower() for kw in ["自动保存", "功能", "省心", "使用"]
        ), f"问题没有承接用户提到的内容: {question1}"

        # 场景2: 用户抱怨遇到问题
        history2 = [
            {"role": "assistant", "content": "使用中有遇到什么问题吗？"},
            {"role": "user", "content": "有时候会卡顿，特别是导出大文件的时候"},
        ]

        question2 = await asyncio.to_thread(
            llm.generate_next_question_enhanced,
            conversation_history=history2,
            current_topic="性能问题",
            topic_description="了解性能问题和改进建议",
            current_topic_index=1,
            total_topics=3,
            extracted_info={},
            persona_config=persona,
        )

        # 问题应该提到"卡顿"或"导出"
        assert any(
            kw in question2.lower() for kw in ["卡顿", "导出", "文件", "性能"]
        ), f"问题没有承接用户的抱怨: {question2}"

        # 两个问题应该不同
        assert question1 != question2, "不同场景产生了相同问题！上下文感知失效"


class TestLLMCallVerification:
    """测试4: LLM调用验证 - 确保真正调用LLM"""

    def test_qwen_service_uses_real_api(self):
        """验证QwenService配置正确，会调用真实API"""
        llm = get_qwen_service()

        # API Key应该已设置
        assert llm.api_key is not None and len(llm.api_key) > 10, (
            "API Key未配置！请设置DASHSCOPE_API_KEY环境变量"
        )

        # 不应该走mock
        assert llm._dashscope_available, (
            "dashscope不可用，请检查安装: pip install dashscope"
        )

    @pytest.mark.asyncio
    async def test_llm_returns_natural_language(self):
        """验证LLM返回自然语言，不是固定模板"""
        llm = get_qwen_service()

        try:
            response = await asyncio.to_thread(
                llm.chat,
                messages=[{"role": "user", "content": "请用一句话问候用户"}],
                temperature=0.7,
            )

            # 返回应该是自然语言，不是固定短语
            assert len(response) > 10, f"回复太短，可能是mock: {response}"
            assert response not in ["这是模拟回复。", "Mock response"], (
                f"返回了mock响应！实际返回: {response}"
            )

            # 应该包含自然语言特征（标点、语气词等）
            assert any(c in response for c in "，。！？"), (
                f"回复缺少自然语言标点: {response}"
            )

        except Exception as e:
            pytest.fail(f"LLM调用失败，请检查API Key是否有效: {e}")


class TestEndToEndFlow:
    """测试5: 端到端流程 - 完整访谈流程"""

    @pytest.mark.asyncio
    async def test_full_interview_flow(self):
        """测试完整访谈流程，验证对话自然连贯"""

        # 启动访谈
        result1 = await asyncio.to_thread(
            run_interview,
            session_id="test_session_001",
            user_id="test_user",
            template_id="quality_survey",
            topic="质量满意度调查",
            user_message=None,  # 初始化
        )

        # 应该生成开场问题
        assert "conversation_history" in result1
        assert len(result1["conversation_history"]) > 0

        opening = result1["conversation_history"][-1]["content"]
        assert len(opening) > 10, f"开场问题太短: {opening}"

        # 用户回答
        result2 = await asyncio.to_thread(
            run_interview,
            session_id="test_session_001",
            user_id="test_user",
            template_id="quality_survey",
            topic="质量满意度调查",
            user_message="我觉得产品质量挺好的，特别是稳定性",
        )

        # 应该生成追问或下一个问题
        assert len(result2["conversation_history"]) > len(
            result1["conversation_history"]
        )

        next_question = result2["conversation_history"][-1]["content"]

        # 问题应该承接用户提到的"稳定性"
        assert any(
            kw in next_question.lower() for kw in ["稳定", "质量", "具体", "方面"]
        ), f"追问没有承接用户回答: {next_question}"


# 测试运行命令:
# pytest tests/test_conversation.py -v
# pytest tests/test_conversation.py::TestOutputDiversity -v  # 只跑多样性测试
# pytest tests/test_conversation.py::TestPersonaControllability -v  # 只跑可控性测试
