import { VolcengineLLM, DEFAULT_MODEL } from '../integrations/llm/volcengine.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';

const VAGUE_PATTERNS = [
  /maybe|perhaps|not sure|could be|might|possibly/i,
  /一般|可能|也许|不太确定|还好|还行/i,
];

const NEGATIVE_EMOTION_PATTERNS = [
  /不想|不要|拒绝|为什么|干嘛|无聊|烦|讨厌|听不懂|没用|没意义/i,
  /不想谈|为什么要|你是.*吗|不想回答|不想聊/i,
  /真无聊|太无聊|没意思|浪费时间/i,
];

const EMPATHY_RESPONSES = [
  '我理解您可能有些疲惫或不太想聊这个话题，没关系，我们可以换个方向。',
  '听起来您对这个话题不太感兴趣，我们可以聊聊您更关心的事情。',
  '我明白，有些问题可能确实让人不想回答。您有什么其他想分享的吗？',
  '感谢您的坦诚，如果不想继续某个话题，我们完全可以跳过。',
];

export async function isFollowupNeeded(userAnswer: string): Promise<boolean> {
  if (!userAnswer || userAnswer.trim().length < 5) {
    return true;
  }

  if (VAGUE_PATTERNS.some((pattern) => pattern.test(userAnswer))) {
    return true;
  }

  const llm = VolcengineLLM.fromEnv();
  const prompt = promptService.render('isFollowupNeeded', { userAnswer });

  try {
    const response = await withRetry(() =>
      llm.chat({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
      })
    );

    return response.content.trim().toUpperCase() === 'YES';
  } catch {
    return false;
  }
}

export async function generateFollowup(
  question: string,
  userAnswer: string,
  conversationHistory: string
): Promise<string | null> {
  const needed = await isFollowupNeeded(userAnswer);
  if (!needed) {
    return null;
  }

  const llm = VolcengineLLM.fromEnv();
  const prompt = promptService.render('generateFollowup', {
    question,
    userAnswer,
    conversationHistory,
  });

  try {
    const response = await withRetry(() =>
      llm.chat({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
      })
    );

    const content = response.content.trim();
    return content === 'SKIP' ? null : content;
  } catch {
    return null;
  }
}

const MIN_ANSWER_LENGTH_FOR_ACK = 10;

function hasNegativeEmotion(text: string): boolean {
  return NEGATIVE_EMOTION_PATTERNS.some((pattern) => pattern.test(text));
}

function getEmpathyResponse(): string {
  return EMPATHY_RESPONSES[Math.floor(Math.random() * EMPATHY_RESPONSES.length)];
}

export async function generateAcknowledgment(
  topic: string,
  userAnswer: string
): Promise<string | null> {
  if (!userAnswer || userAnswer.trim().length < 3) {
    return null;
  }

  if (hasNegativeEmotion(userAnswer)) {
    return getEmpathyResponse();
  }

  if (userAnswer.trim().length < MIN_ANSWER_LENGTH_FOR_ACK) {
    return null;
  }

  const llm = VolcengineLLM.fromEnv();
  const prompt = promptService.render('generateAcknowledgment', {
    topic,
    userAnswer,
  });

  try {
    const response = await withRetry(() =>
      llm.chat({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
      })
    );

    return response.content.trim();
  } catch {
    return null;
  }
}
