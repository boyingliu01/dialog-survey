import { InterviewTemplate } from './types';

export function PLANNING_PROMPT(template: InterviewTemplate): string {
  return `你好！我是智能面试机器人，我们将进行一场关于"${template.name}"的访谈。

${template.description || ''}

访谈将围绕以下主题展开：
${template.topics.map((topic, index) => `${index + 1}. ${topic.name} - ${topic.description || ''}，首问：${topic.initial_question}`).join('\n')}
`;
}

export function INTERVIEW_PROMPT(
  template: InterviewTemplate,
  currentTopicIndex: number,
  currentQuestionIndex: number
): string {
  const topic = template.topics[currentTopicIndex];
  const question = template.questions[currentQuestionIndex];
  return `当前主题：${topic.name} - ${topic.description || ''}

请回答以下问题：
${question ? question.text : ''}`;
}

export function FOLLOWUP_PROMPT(
  originalQuestion: string,
  userAnswer: string
): string {
  return `您对"${originalQuestion}"的回答是：${userAnswer}

您的回答似乎比较简洁或不完整，能否请您详细说明一下？`;
}

export function ANALYZE_PROMPT(template: InterviewTemplate): string {
  return `请分析以下访谈内容，并生成一份详细的访谈报告。

报告应包括：
1. 访谈概览
2. 各主题详细分析
3. 关键发现
4. 建议

访谈主题：
${template.topics.map((topic) => `- ${topic.name}: ${topic.description || ''}`).join('\n')}

${template.domain_context || ''}

请根据以上信息和访谈记录生成报告。`;
}
