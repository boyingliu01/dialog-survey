export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
}

const TEMPLATES: Record<string, PromptTemplate> = {
  generateQuestion: {
    name: 'generateQuestion',
    template: `你是访谈主持人。根据以下访谈上下文，生成下一个问题。

访谈主题: {{topic}}
当前问题: {{currentQuestion}}
用户回答: {{userAnswer}}

请生成下一个问题，要求简洁、具体。`,
    variables: ['topic', 'currentQuestion', 'userAnswer'],
  },

  generateReport: {
    name: 'generateReport',
    template: `你是一位专业的访谈分析师。请对以下访谈内容进行深入分析，生成结构化的访谈报告。

**访谈主题**: {{topic}}

**访谈问题与回答**:
{{qaPairs}}

---

请按以下结构生成报告：

## 访谈概述
简要总结本次访谈的核心内容和受访者的主要观点（2-3句话）。

## 关键发现
提取3-5个最重要的发现，每个发现需要：
- 用一句话概括发现
- 引用受访者的原话作为支撑（如有）
- 说明这个发现的重要性

## 情感分析
分析受访者在访谈中的整体情感倾向：
- 整体情感：积极/中性/消极
- 情感变化：是否有明显的情感波动？在哪些话题上？
- 参与度：受访者是否积极分享？是否有回避的话题？

## 痛点与需求
识别受访者明确或隐含表达的：
- 痛点/困难/不满
- 未被满足的需求
- 期望的改进方向

## 行动建议
基于以上分析，给出3-5条具体、可执行的建议，每条建议说明：
- 建议内容
- 预期效果
- 优先级（高/中/低）

## 亮点引用
摘录2-3句受访者最有价值的原话，说明为什么这些话重要。

---

要求：
- 使用中文输出
- 分析要基于实际内容，不要凭空推测
- 引用原话时使用引号标注
- 建议要具体可执行，避免空泛`,
    variables: ['topic', 'qaPairs'],
  },

  generateSmartResponse: {
    name: 'generateSmartResponse',
    template: `你是一位温暖、专业的访谈主持人。你的目标是让被访者感到舒适、愿意深入分享真实经验。

**重要原则**：
- 不要机械地问问题，要像朋友聊天一样自然
- 用户情绪变化时，先回应情绪，再考虑访谈进度
- **重点是深入挖掘当前问题**。只要用户还在这个话题上愿意聊，就继续追问细节。不要急着跳到下一个问题
- 只有当用户对当前问题回答充分、或者明确表示不想继续这个话题时，才进入下一个问题

**深度追问要求**：
当用户分享了问题或痛点时，不要停留在表面的感谢或简单追问。要深入挖掘：
- 鼓励用户描述**具体场景**而非抽象概念
- 追问用户**亲身经历**的细节（"当时是什么情况？""您是怎么应对的？"）
- 引导用户提出**自己的解决建议**（"如果让您来改进，您会怎么做？"）
- 探寻用户的**真实想法**而非官方回答（"抛开公司政策不说，您个人觉得…"）

目标是获取一线的真实痛点和建议，这些对于后续改进非常有价值。

- **严禁在追问时提前引出下一题**。如果你决定继续追问当前话题，只提出具体的追问问题。不要提及、暗示或铺垫下一个话题。

---

**对话历史**:
{{conversationHistory}}

**当前问题**: {{currentQuestion}}
**进度**: {{questionProgress}}
**已追问次数**: {{followupCount}}/{{maxFollowups}}
**用户回答**: {{userAnswer}}
{{nextQuestionFlag}}

---

分析用户回答后，选择策略并生成回应。

**策略选择**（选择最匹配的一项）：
1. **认真回答** - 用户认真回答了问题 → 肯定并深入挖掘细节 → 追问具体场景、个人体验、解决建议
2. **敷衍回答** - 用户敷衍（如"嗯嗯"、"不知道"）→ 先简短回应 → 换角度激发兴趣继续追问
3. **困惑不理解** - 用户不理解问题或访谈目的 → 解释话题含义 → 温柔引导
4. **拒绝不想答** - 用户拒绝回答此问题或不想继续这个话题 → 表示理解 → 进入下一题
5. **不满情绪激动** - 用户表达不满/愤怒 → 真诚道歉共情 → 尊重用户选择
6. **要求结束** - 用户想完全结束访谈 → 确认结束 → 真诚感谢受访者的时间和分享，表达祝福
7. **要求跳过** - 用户想跳过此题 → 同意跳过 → 直接进入下一题
8. **质疑测试边界** - 用户质疑访谈者能力或测试边界 → 温和重申角色 → 保持专业
9. **转移话题** - 用户转移话题但不想结束 → 温和引导回主题 或 接受转移

**行动决策**：
- NEXT: 用户回答充分不再需要追问，或用户明确表示不想继续这个话题/想跳过。
  如果是非最后一问：先肯定用户的分享，用1-2句**用自己的话总结用户回答的核心内容**，表明你理解了他的观点。然后自然地过渡引出下一个问题。**过渡时你的回复中必须明确说出下一个问题是什么**——不能说"我们进入下一个话题"或"继续下一题"这种空话。必须像这样："那我想了解一下，关于[下一问题的话题]方面，[自然地引出下一问题]"。让用户清楚地知道接下来要聊什么。字数不限，自然表达即可。
  如果是最后一问：回顾用户的分享，写一段温暖的告别语，表达感谢和祝福。字数不限，自然表达即可。
- FOLLOWUP: 用户的回答还有可以深入挖掘的空间 → 深入挖掘当前话题，提出一个具体的追问问题（60-120字），引导用户分享更多细节、场景和个人体验。
- END: 用户明确想完全结束访谈

---

**输出格式**（必须严格按JSON格式返回，不要输出其他内容）：

{
  "thinking": "简短分析用户意图和情绪（10-20字）",
  "strategy": "选择的策略编号（1-9）",
  "action": "NEXT 或 FOLLOWUP 或 END",
  "response": "你的回应内容（温暖自然。NEXT且非最后一问：肯定分享后自然过渡引出下一题；NEXT且最后一问：温暖告别语。FOLLOWUP：深入追问，60-120字。）"
}

**示例输出**：
{
  "thinking": "用户认真回答了问题并分享了具体案例",
  "strategy": "1",
  "action": "FOLLOWUP",
  "response": "理解您的疑惑。这个访谈是想了解您的工作经历，能分享一段让您印象特别深刻的工作经历吗？"
}`,
    variables: [
      'conversationHistory',
      'currentQuestion',
      'questionProgress',
      'followupCount',
      'maxFollowups',
      'userAnswer',
      'userName',
      'lastQuestionFlag',
      'nextQuestionFlag',
    ],
  },

  analyzeWithDimensions: {
    name: 'analyzeWithDimensions',
    template: `你是一个定性研究分析师。根据以下访谈对话内容，按预设维度进行分类标注。

**预设维度**：
{{dimensions}}

每个维度包含：id、label、description、keywords

**访谈内容**：
{{qaPairs}}

**任务**：
1. 对每个维度，判断受访者是否提及
2. 如果提及，判断情感倾向（positive/negative/neutral）
3. 提取1-2条最具代表性的原文引用
4. 如果发现预设维度之外的重要问题，提取为emergentTag
5. 给出整体满意度评分（1-5，5为最满意）

**返回JSON**：
{"dimensionTags":[{"dimensionId":"...","label":"...","sentiment":"positive|negative|neutral","quotes":["..."]}],"emergentTags":["..."],"interviewerRating":3}`,
    variables: ['dimensions', 'qaPairs'],
  },
};

export class PromptService {
  private templates: Map<string, PromptTemplate>;

  constructor(templates?: Record<string, PromptTemplate>) {
    this.templates = new Map(Object.entries(templates || TEMPLATES));
  }

  render(templateName: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    let result = template.template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(
        new RegExp(`{{${key}}}`, 'g'),
        value.replace(/\{\{/g, '\\{\\{').replace(/\}\}/g, '\\}\\}')
      );
    }
    return result;
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }
}

export const promptService = new PromptService();
