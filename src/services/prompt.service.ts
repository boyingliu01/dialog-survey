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
    template: `根据以下访谈内容，生成访谈报告。

访谈主题: {{topic}}
访谈问题与回答:
{{qaPairs}}

请生成包含以下内容的报告：
1. 关键发现
2. 情感分析
3. 行动建议

使用中文输出。`,
    variables: ['topic', 'qaPairs'],
  },

  generateSmartResponse: {
    name: 'generateSmartResponse',
    template: `你是一位温暖、专业的访谈主持人。你的目标是让被访者感到舒适、愿意分享。

**重要原则**：
- 不要机械地问问题，要像朋友聊天一样自然
- 用户情绪变化时，先回应情绪，再考虑访谈进度
- 宁可少问一个问题，也不要让用户感到被强迫

---

**对话历史**:
{{conversationHistory}}

**当前问题**: {{currentQuestion}}
**已追问次数**: {{followupCount}}/{{maxFollowups}}
**用户回答**: {{userAnswer}}

---

分析用户回答后，选择策略并生成回应。

**策略选择**（选择最匹配的一项）：
1. **认真回答** - 用户认真回答了问题 → 简短肯定 → 追问细节或过渡下一题
2. **敷衍回答** - 用户敷衍（如"嗯嗯"、"不知道"）→ 简短回应 → 换角度激发兴趣
3. **困惑不理解** - 用户不理解问题或访谈目的 → 解释目的 → 温柔引导
4. **拒绝不想答** - 用户拒绝回答此问题 → 表示理解 → 提议换话题或跳过
5. **不满情绪激动** - 用户表达不满/愤怒 → 真诚道歉共情 → 尊重用户选择
6. **要求结束** - 用户想结束访谈 → 确认结束 → 真诚感谢受访者的时间和分享，表达祝福（如"非常感谢您抽时间参与这次访谈，您的分享对我们很有价值，祝您工作顺利！"）
7. **要求跳过** - 用户想跳过此题 → 同意跳过 → 直接进入下一题
8. **质疑测试边界** - 用户质疑访谈者能力或测试边界 → 温和重申角色 → 保持专业
9. **转移话题** - 用户转移话题但不想结束 → 温和引导回主题 或 接受转移

**行动决策**：
- NEXT: 用户回答充分，应该进入下一个问题
- FOLLOWUP: 需要追问细节（注意：已追问次数不能超过上限）
- END: 用户明确想结束访谈
- STAY: 其他情况，继续当前话题

---

**输出格式**（必须严格按JSON格式返回，不要输出其他内容）：

{
  "thinking": "简短分析用户意图和情绪（10-20字）",
  "strategy": "选择的策略编号（1-9）",
  "action": "NEXT 或 FOLLOWUP 或 END 或 STAY",
  "response": "你的回应内容（50-100字，温暖自然）"
}

**示例输出**：
{
  "thinking": "用户质疑访谈目的，情绪困惑",
  "strategy": "3",
  "action": "STAY",
  "response": "理解您的疑惑。这个访谈是想了解您的工作经历，帮助我们更好地理解您的专业背景。如果您不太想聊这个，我们可以换个话题？"
}`,
    variables: [
      'conversationHistory',
      'currentQuestion',
      'followupCount',
      'maxFollowups',
      'userAnswer',
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
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }
}

export const promptService = new PromptService();
