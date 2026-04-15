import { VolcengineLLM, DEFAULT_MODEL } from '../integrations/llm/volcengine.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';

const VAGUE_PATTERNS = [
  /maybe|perhaps|not sure|could be|might|possibly/i,
  /一般|可能|也许|不太确定|还好|还行/i,
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

const MIN_ANSWER_LENGTH_FOR_ACK = 30;

export async function generateAcknowledgment(
  topic: string,
  userAnswer: string
): Promise<string | null> {
  if (!userAnswer || userAnswer.trim().length < MIN_ANSWER_LENGTH_FOR_ACK) {
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
