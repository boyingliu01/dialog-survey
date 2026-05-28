// @ts-nocheck
function stryNS_9fa48() {
  var g =
    (typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis) ||
    new Function('return this')();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (
    ns.activeMutant === undefined &&
    g.process &&
    g.process.env &&
    g.process.env.__STRYKER_ACTIVE_MUTANT__
  ) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov =
    ns.mutantCoverage ||
    (ns.mutantCoverage = {
      static: {},
      perTest: {},
    });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
}
const TEMPLATES: Record<string, PromptTemplate> = stryMutAct_9fa48('438')
  ? {}
  : (stryCov_9fa48('438'),
    {
      generateQuestion: stryMutAct_9fa48('439')
        ? {}
        : (stryCov_9fa48('439'),
          {
            name: stryMutAct_9fa48('440') ? '' : (stryCov_9fa48('440'), 'generateQuestion'),
            template: stryMutAct_9fa48('441')
              ? ``
              : (stryCov_9fa48('441'),
                `你是访谈主持人。根据以下访谈上下文，生成下一个问题。

访谈主题: {{topic}}
当前问题: {{currentQuestion}}
用户回答: {{userAnswer}}

请生成下一个问题，要求简洁、具体。`),
            variables: stryMutAct_9fa48('442')
              ? []
              : (stryCov_9fa48('442'),
                [
                  stryMutAct_9fa48('443') ? '' : (stryCov_9fa48('443'), 'topic'),
                  stryMutAct_9fa48('444') ? '' : (stryCov_9fa48('444'), 'currentQuestion'),
                  stryMutAct_9fa48('445') ? '' : (stryCov_9fa48('445'), 'userAnswer'),
                ]),
          }),
      generateReport: stryMutAct_9fa48('446')
        ? {}
        : (stryCov_9fa48('446'),
          {
            name: stryMutAct_9fa48('447') ? '' : (stryCov_9fa48('447'), 'generateReport'),
            template: stryMutAct_9fa48('448')
              ? ``
              : (stryCov_9fa48('448'),
                `根据以下访谈内容，生成访谈报告。

访谈主题: {{topic}}
访谈问题与回答:
{{qaPairs}}

请生成包含以下内容的报告：
1. 关键发现
2. 情感分析
3. 行动建议

使用中文输出。`),
            variables: stryMutAct_9fa48('449')
              ? []
              : (stryCov_9fa48('449'),
                [
                  stryMutAct_9fa48('450') ? '' : (stryCov_9fa48('450'), 'topic'),
                  stryMutAct_9fa48('451') ? '' : (stryCov_9fa48('451'), 'qaPairs'),
                ]),
          }),
      generateSmartResponse: stryMutAct_9fa48('452')
        ? {}
        : (stryCov_9fa48('452'),
          {
            name: stryMutAct_9fa48('453') ? '' : (stryCov_9fa48('453'), 'generateSmartResponse'),
            template: stryMutAct_9fa48('454')
              ? ``
              : (stryCov_9fa48('454'),
                `你是一位温暖、专业的访谈主持人。你的目标是让被访者感到舒适、愿意深入分享真实经验。

**重要原则**：
- 不要机械地问问题，要像朋友聊天一样自然
- 用户情绪变化时，先回应情绪，再考虑访谈进度
- 宁可少问一个问题，也不要让用户感到被强迫
- **绝对不要在回应中包含或暗示下一个问题**。你只需要对用户的当前回答做出温暖回应，下一个问题会由系统自动追加。如果你重复了下一个问题，用户会感到困惑。

**深度追问要求**：
当用户分享了问题或痛点时，不要停留在表面的感谢或简单追问。要深入挖掘：
- 鼓励用户描述**具体场景**而非抽象概念
- 追问用户**亲身经历**的细节（"当时是什么情况？""您是怎么应对的？"）
- 引导用户提出**自己的解决建议**（"如果让您来改进，您会怎么做？"）
- 探寻用户的**真实想法**而非官方回答（"抛开公司政策不说，您个人觉得…"）

目标是获取一线的真实痛点和建议，这些对于后续改进非常有价值。

---

**对话历史**:
{{conversationHistory}}

**当前问题**: {{currentQuestion}}
**已追问次数**: {{followupCount}}/{{maxFollowups}}
**用户回答**: {{userAnswer}}

---

分析用户回答后，选择策略并生成回应。

**策略选择**（选择最匹配的一项）：
1. **认真回答** - 用户认真回答了问题 → 肯定并深入挖掘细节 → 追问具体场景、个人体验、解决建议
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
- FOLLOWUP: 需要追问细节（注意：已追问次数不能超过上限）。追问时应提出一个具体的新问题，引导用户深入分享经验和建议。
- END: 用户明确想结束访谈
- STAY: 其他情况，继续当前话题

---

**输出格式**（必须严格按JSON格式返回，不要输出其他内容）：

{
  "thinking": "简短分析用户意图和情绪（10-20字）",
  "strategy": "选择的策略编号（1-9）",
  "action": "NEXT 或 FOLLOWUP 或 END 或 STAY",
  "response": "你的回应内容（50-100字，温暖自然。如果是NEXT，只需肯定用户的分享，不要包含下一个问题。）"
}

**示例输出**：
{
  "thinking": "用户质疑访谈目的，情绪困惑",
  "strategy": "3",
  "action": "STAY",
  "response": "理解您的疑惑。这个访谈是想了解您的工作经历，帮助我们更好地理解您的专业背景。如果您不太想聊这个，我们可以换个话题？"
}`),
            variables: stryMutAct_9fa48('455')
              ? []
              : (stryCov_9fa48('455'),
                [
                  stryMutAct_9fa48('456') ? '' : (stryCov_9fa48('456'), 'conversationHistory'),
                  stryMutAct_9fa48('457') ? '' : (stryCov_9fa48('457'), 'currentQuestion'),
                  stryMutAct_9fa48('458') ? '' : (stryCov_9fa48('458'), 'followupCount'),
                  stryMutAct_9fa48('459') ? '' : (stryCov_9fa48('459'), 'maxFollowups'),
                  stryMutAct_9fa48('460') ? '' : (stryCov_9fa48('460'), 'userAnswer'),
                  stryMutAct_9fa48('461') ? '' : (stryCov_9fa48('461'), 'userName'),
                  stryMutAct_9fa48('462') ? '' : (stryCov_9fa48('462'), 'lastQuestionFlag'),
                ]),
          }),
      analyzeWithDimensions: stryMutAct_9fa48('463')
        ? {}
        : (stryCov_9fa48('463'),
          {
            name: stryMutAct_9fa48('464') ? '' : (stryCov_9fa48('464'), 'analyzeWithDimensions'),
            template: stryMutAct_9fa48('465')
              ? ``
              : (stryCov_9fa48('465'),
                `你是一个定性研究分析师。根据以下访谈对话内容，按预设维度进行分类标注。

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
{"dimensionTags":[{"dimensionId":"...","label":"...","sentiment":"positive|negative|neutral","quotes":["..."]}],"emergentTags":["..."],"interviewerRating":3}`),
            variables: stryMutAct_9fa48('466')
              ? []
              : (stryCov_9fa48('466'),
                [
                  stryMutAct_9fa48('467') ? '' : (stryCov_9fa48('467'), 'dimensions'),
                  stryMutAct_9fa48('468') ? '' : (stryCov_9fa48('468'), 'qaPairs'),
                ]),
          }),
    });
export class PromptService {
  private templates: Map<string, PromptTemplate>;
  constructor(templates?: Record<string, PromptTemplate>) {
    if (stryMutAct_9fa48('469')) {
      {
      }
    } else {
      stryCov_9fa48('469');
      this.templates = new Map(
        Object.entries(
          stryMutAct_9fa48('472')
            ? templates && TEMPLATES
            : stryMutAct_9fa48('471')
              ? false
              : stryMutAct_9fa48('470')
                ? true
                : (stryCov_9fa48('470', '471', '472'), templates || TEMPLATES)
        )
      );
    }
  }
  render(templateName: string, variables: Record<string, string>): string {
    if (stryMutAct_9fa48('473')) {
      {
      }
    } else {
      stryCov_9fa48('473');
      const template = this.templates.get(templateName);
      if (
        stryMutAct_9fa48('476')
          ? false
          : stryMutAct_9fa48('475')
            ? true
            : stryMutAct_9fa48('474')
              ? template
              : (stryCov_9fa48('474', '475', '476'), !template)
      ) {
        if (stryMutAct_9fa48('477')) {
          {
          }
        } else {
          stryCov_9fa48('477');
          throw new Error(
            stryMutAct_9fa48('478')
              ? ``
              : (stryCov_9fa48('478'), `Template not found: ${templateName}`)
          );
        }
      }
      let result = template.template;
      for (const [key, value] of Object.entries(variables)) {
        if (stryMutAct_9fa48('479')) {
          {
          }
        } else {
          stryCov_9fa48('479');
          result = result.replace(
            new RegExp(
              stryMutAct_9fa48('480') ? `` : (stryCov_9fa48('480'), `{{${key}}}`),
              stryMutAct_9fa48('481') ? '' : (stryCov_9fa48('481'), 'g')
            ),
            value
          );
        }
      }
      return result;
    }
  }
  getTemplate(name: string): PromptTemplate | undefined {
    if (stryMutAct_9fa48('482')) {
      {
      }
    } else {
      stryCov_9fa48('482');
      return this.templates.get(name);
    }
  }
}
export const promptService = new PromptService();
