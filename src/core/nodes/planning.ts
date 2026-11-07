import { polishFirstQuestion } from '../../services/followup.service.js';
import type { PrismaClient } from '../../utils/prisma-client.js';
import type { InterviewState, NodeOutput } from '../types/index.js';
import { loadTemplateContent } from './template-utils.js';

/**
 * The line that tells the interviewee the shape of the whole conversation (#228).
 *
 * Derived from `questions.length`, never from template copy: the opening message in
 * the measured case promised "25-35 minutes" and the interview ran 48, so a
 * hand-written estimate is a promise the code cannot keep. A question count is
 * checkable, and it is exactly what the interviewee asked for ("现在进展到 3/14？").
 */
function progressPromise(totalQuestions: number): string {
  return `本次访谈共 ${totalQuestions} 个话题，我会在每个问题后标注进度（如 3/${totalQuestions}）。您可以随时回复"跳过"跳到下一个话题，或回复"结束"提前收尾。`;
}

/** Words that establish the conversation is an interview within the first ~40 chars. */
const INTENT_SIGNAL = /访谈|采访|聊一聊|survey|interview/i;

/**
 * Make the greeting state its intent up front.
 *
 * A template's `invitationPrompt` sometimes opens with vague methodology text, so the
 * interviewee has to read several lines before learning this is an interview. When the
 * opening 40 characters carry no intent word, a one-line label is prepended.
 */
function withIntentLabel(greeting: string, templateName: string | undefined): string {
  if (INTENT_SIGNAL.test(greeting.substring(0, 40))) return greeting;
  // `name` is optional by contract (the content JSON has no name field), so fall
  // back rather than interpolating `undefined` into the greeting.
  const title = templateName ? `「${templateName}」访谈调查` : '本次访谈调查';
  return `欢迎参加${title}。\n\n${greeting}`;
}

export async function planningNode(
  state: InterviewState,
  prisma?: PrismaClient
): Promise<Partial<InterviewState> & NodeOutput> {
  const content = await loadTemplateContent(state.templateId, prisma);
  const firstQuestion = content.questions[0] || '请开始回答，我会根据您的回答进行追问。';
  const refinedFirstQuestion = await polishFirstQuestion(firstQuestion);
  const greeting = withIntentLabel(content.invitationPrompt, content.name);

  // The count is appended by code rather than left to the template author, and is
  // omitted for an empty question list -- `progressPromise` would read "共 0 个话题"
  // and promise a progress marker the interview will never produce.
  const promise =
    content.questions.length > 0 ? `\n\n${progressPromise(content.questions.length)}` : '';
  const fullMessage = `${greeting}${promise}\n\n${refinedFirstQuestion}`;

  return {
    status: 'ACTIVE',
    currentQuestion: 0,
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: fullMessage,
        timestamp: new Date(),
      },
    ],
    response: fullMessage,
    shouldContinue: true,
  };
}
