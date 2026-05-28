# 访谈体验优化方案

> **日期**: 2026-04-28
> **状态**: Round 1 评审修复完成 → Round 2 待审
> **来源**: 用户访谈复盘反馈

---

## 一、诊断问题

### 1.1 根因分析

| 问题 | 现象 | 根因 | 代码位置 |
|------|------|------|----------|
| **访谈没有温度** | "感谢您的回答，我们继续下一个话题"+下一个问题 | Prompt 约束过度（"绝对不要暗示下一个问题"），LLM 变成了机械复读机 | `prompt.service.ts` |
| **身份遗忘** | 用户问"你不知道我的联系方式？"时无视 | Prompt 缺乏访谈背景上下文和身份质疑处理逻辑 | `prompt.service.ts` |
| **用户困惑未解决** | "我不是说了7-8分吗"，机器人跳到下一题 | LLM 情绪检测敏感度不够，Prompt 未强调"先处理情绪再推进" | `prompt.service.ts` |
| **结尾生硬** | 最后问题回答后直接发固定结束语 | `interviewing.ts` 机械拼接，未结合对话历史生成定制告别 | `interviewing.ts` |

### 1.2 核心矛盾

**"一次只问一个问题" vs "有温度的深度追问"** 之间的平衡。

之前的修复过度关注于"不重复问题"，导致 LLM 失去了自然过渡、情感共鸣和深度追问的能力。

---

## 二、修复方案

### 2.1 Prompt 重构 —— 找回温度（核心）

**目标**: 让 LLM 能基于上文总结 + 情感共鸣 + 自然过渡，而不是机械复读。

**修改位置**: `src/services/prompt.service.ts` 中的 `generateSmartResponse` 模板

**核心变化**:
```
❌ 旧版（机械）:
  - "不要机械地问问题"
  - "绝对不要在回应中包含或暗示下一个问题"
  - 结果：LLM 过度谨慎，只剩"感谢您的回答"

✅ 新版（自然）:
  - "先承接用户的回答要点（具体提到什么就回应什么）"
  - "如果用户提供了细节，追问一个相关的具体问题"
  - "如果用户情绪低落/困惑，先处理情绪，再温柔推进"
  - "如果用户已充分回答，自然过渡到下一个问题"
  - "如果这是最后一个问题，做一段温暖的收尾，结合用户的核心分享"
```

**具体策略定义**:

| 策略 | 触发条件 | LLM 行为要求 |
|------|----------|-------------|
| 深度追问 | 用户分享具体经历/痛点 | 引用用户原话 + 追问细节（"您提到X，能多说一点吗？"） |
| 情感回应 | 用户有负面情绪/困惑 | 共情 + 解释目的 + 温柔引导 |
| 自然过渡 | 用户回答充分 | 总结要点 + 引出下一话题 |
| 优雅收尾 | 最后一个问题回答后 | 回顾核心观点 + 真诚感谢 + 定制化告别 |
| 拒绝处理 | 拒绝回答某问题 | 表示理解 + 提议跳过 |

### 2.2 访谈背景注入（身份补全）

**修改**: 
1. **State 扩展**: 在 `InterviewState` 中增加 `userName?: string`。
2. **初始化**: 在 `stream-message.service.ts` 创建访谈时，从 `InterviewPlan.inviteeData` 中查找 `userId` 对应的 `name`，填入 `state.userName`。
3. **Prompt 注入**: `generateSmartResponse` 的 Prompt 中加入"受访者姓名：{{userName}}。这是一个定向邀约的访谈，请以此身份进行自然的称呼和交流。"

### 2.3 提示词模板在管理界面可编辑（新增）

**需求**: 不要在代码中硬编码 Prompt 模板，而是让管理员在"编辑模板"界面直接编辑提示词。

**设计方案**:
1. 在 `Template.content` JSON 中新增 `llmPromptTemplate` 字段。
2. `followup.service.ts` 中的 `generateSmartResponse` 接受可选的 `customPrompt`。如果有自定义 Prompt，直接使用；否则使用系统默认。
3. **Prompt 消费链路**: `loadTemplateContent` (from `interviewing.ts`) -> pass `content.llmPromptTemplate` -> `generateSmartResponse(state, input, currentQuestion, customPrompt)`.
4. 提供"恢复默认"按钮（重置为系统 Prompt）。

**Template.content 结构变更**:
```json
{
  "name": "模板名称",
  "invitationPrompt": "邀约提示词",
  "questions": ["问题1", "问题2"],
  "closingMessage": "结束语",
  "llmPromptTemplate": "智能追问的 Prompt 模板（可选，留空使用系统默认）",
  "dimensions": [...]
}
```

**管理界面**: 扩展 `form.njk`，增加一个大的 `<textarea>` 编辑 `llmPromptTemplate`。

**验收标准**: P1（用户明确要求）

### 2.4 "一次一问" 的技术护栏（防止回归）

**问题**: 纯靠 Prompt 约束无法防止 LLM 退化。
**修复**: 在 `interviewingNode` 中增加输出校验：
1. 统计 LLM 返回内容中中文/英文问号的数量。
2. 如果数量 >= 2，说明包含了额外的问题。
3. **自动修正**: 仅保留第一个问号之前的内容（作为承接语），或者触发 LLM 重试（如果支持）。

### 2.5 优雅收尾实现（Token 优化）

**修改位置**: `interviewing.ts` 中处理最后一个问题的逻辑

**问题**: 全文注入对话历史导致 Token 膨胀。
**当前代码**: `response: `${smartResult.response}\n\n---\n\n${closing}``
**修改后**: 
1. 在最后一个问题时，调用 `generateSmartResponse` 传入 `isLastQuestion: true`。
2. **上下文截断**: 仅传入最后 3-5 轮对话给 LLM（而非全文），要求 LLM 基于最近的分享生成定制告别。
3. **Fallback**: 如果生成失败，使用 `closingMessage` 作为降级。

---

## 三、影响范围

| 修改项 | 影响文件 | 影响功能 | 风险评估 |
|--------|----------|----------|----------|
| Prompt 重构 | `prompt.service.ts` | 智能追问 | 低 — 仅改变 Prompt 文本 |
| 背景注入 (身份) | `stream-message.service.ts`, `types/index.ts` | 访谈初始化 | 低 — 仅增加字段 |
| 提示词模板可编辑 | `prompt.service.ts`, `followup.service.ts`, `interviewing.ts` | 模板加载与 LLM 调用 | 中 — 新增逻辑路径，需兼容旧模板（空 Prompt） |
| 技术护栏 (双问检测) | `interviewing.ts` | 智能追问输出 | 低 — 纯后置校验逻辑 |
| 优雅收尾 (截断上下文) | `interviewing.ts` | 访谈结束 | 低 — 仅改变参数传递 |
| 管理界面表单 | `form.njk` | 模板编辑 | 低 — 增加 textarea |

---

## 四、验收标准 (Delphi Round 1 Feedback)

1. [ ] 用户分享细节时，机器人能引用具体内容并追问（不是"感谢回答"）
2. [ ] 用户质疑身份时，机器人能准确报出用户姓名并坦诚回应
3. [ ] 用户情绪变化时，机器人先处理情绪
4. [ ] 访谈结束有温暖的定制化告别（基于最近 3-5 轮对话，非全文拼接）
5. [ ] 管理界面可以直接编辑提示词模板
6. [ ] **技术护栏生效**: 无论 Prompt 怎么变，发给用户的消息中只含 1 个问题
7. [ ] **兼容性**: 旧模板（无 `llmPromptTemplate`）无缝回退系统默认 Prompt

---

## 五、Round 1 修复记录

### Critical 修复
| # | 问题 | 专家 | 修复方案 |
|---|------|------|----------|
| C1 | "一次问两问"缺乏技术护栏 | A | `interviewing.ts` 增加后置校验，检测问号数量并截断 |
| C2 | `llmPromptTemplate` 无版本/回滚 | A | 提供"恢复默认"按钮，兼容旧模板 |
| C3 | Context/Token 膨胀 | A, B | 定制告别仅使用最后 3-5 轮对话，而非全文 |
| C4 | `llmPromptTemplate` 无消费链路 | B | 定义完整链路：`loadTemplateContent` -> `generateSmartResponse` |
| C5 | `prompt.service.ts` JSON 语法缺陷 | B | 修正缺失的闭合引号 |
| C6 | 拼接逻辑与"一问一答"冲突 | B | 结合护栏逻辑，确保最终输出只有一个问号 |

### Major 修复
| # | 问题 | 专家 | 修复方案 |
|---|------|------|----------|
| M1 | 定制告别上下文策略 | A | 明确：最后 3-5 轮对话 |
| M2 | 受访身份信息缺失 | B | `stream-message.service.ts` 加载 `inviteeData` 到 `state.userName` |
| M3 | 优雅收尾边界模糊 | B | 明确由 LLM 生成定制告别，模板消息作为 Fallback |
| M4 | 情绪检测敏感性 | A, B | Prompt 策略定义明确，策略 3/5 优先于策略 1 |

---

## 五、Round 2 实施完成

### 核心修复代码实现情况
| # | Issue | 修复位置 | 修复内容 | 状态 |
|---|-------|----------|----------|------|
| C1 | "双问"技术护栏 | `interviewing.ts` | 新增 `containsMultipleQuestions` 后置校验，检测到多余问号自动截断 | ✅ 已实现 |
| C2 | `llmPromptTemplate` 消费 | `followup.service.ts` | `generateSmartResponse` 增加 `customPrompt` 参数；`loadTemplateContent` 读取并传入 | ✅ 已实现 |
| C3 | Prompt 语法缺陷 | `prompt.service.ts` | 修复缺失的闭合引号 | ✅ 已验证 |
| M1 | 受访者身份信息缺失 | `types/index.ts`, `followup.service.ts` | 增加 `userName` 字段；Prompt 中注入 `userName` 及 `lastQuestionFlag` | ✅ 已实现 |
| M2 | 优雅收尾 (Token 优化) | `interviewing.ts`, `followup.service.ts` | 最后一个问题传入 `isLastQuestion=true`；LLM 基于最近 6 轮对话 (`.slice(-6)`) 生成定制告别 | ✅ 已实现 |

### 最终共识 (等待 Expert B 验证后更新)
