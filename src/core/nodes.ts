import { InterviewState, Message, LLMMessage, InterviewStatus } from '../types/index';
import * as stateUtils from './state';

// Simple LLM provider interface for node operations
interface LLMProvider {
  chat(messages: LLMMessage[]): Promise<string>;
}

// Placeholder LLM provider - should be injected from caller
let llmProvider: LLMProvider | null = null;

export function setLLMProvider(provider: LLMProvider): void {
  llmProvider = provider;
}

async function callLLM(messages: LLMMessage[]): Promise<string> {
  if (!llmProvider) {
    throw new Error('LLM provider not set. Call setLLMProvider() first.');
  }
  return llmProvider.chat(messages);
}

/**
 * Planning node - generates welcome message and first question
 */
export async function planningNode(state: InterviewState): Promise<Partial<InterviewState>> {
  const systemPrompt = `You are an AI interviewer conducting a structured interview about "${state.topic}".
Context: ${state.domainContext}

Your task is to:
1. Welcome the user warmly and professionally
2. Briefly explain the purpose of this interview
3. Ask the first question naturally

Be conversational but professional. Keep your response concise (2-3 sentences for welcome + 1 question).`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Please start the interview.' },
  ];

  try {
    const response = await callLLM(messages);

    const assistantMessage: Message = {
      role: 'assistant',
      content: response,
    };

    return {
      conversationHistory: [...state.conversationHistory, assistantMessage],
      status: 'interviewing' as InterviewStatus,
    };
  } catch (error) {
    console.error('Error in planningNode:', error);
    return {
      conversationHistory: [
        ...state.conversationHistory,
        { role: 'assistant', content: 'Welcome! Let\'s begin our interview. Could you tell me a bit about your experience?' },
      ],
      status: 'interviewing' as InterviewStatus,
    };
  }
}

/**
 * Interview node - processes user answer and generates next question
 */
export async function interviewNode(state: InterviewState): Promise<Partial<InterviewState>> {
  const userAnswer = stateUtils.extractUserAnswer(state);

  if (!userAnswer) {
    // No user answer, just continue
    return state;
  }

  const currentTopic = stateUtils.getCurrentTopic(state);
  const topicContext = currentTopic ? `Current topic: ${currentTopic.name}` : 'General discussion';

  const systemPrompt = `You are conducting an interview about "${state.topic}".
${topicContext}

The user just answered: "${userAnswer}"

Your task:
1. Acknowledge their answer briefly and naturally
2. Ask a thoughtful follow-up question that digs deeper into the topic
3. Keep the conversation flowing naturally

Be conversational but professional. 2-3 sentences total.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...state.conversationHistory.slice(-6).map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await callLLM(messages);

    const assistantMessage: Message = {
      role: 'assistant',
      content: response,
    };

    return {
      conversationHistory: [...state.conversationHistory, assistantMessage],
    };
  } catch (error) {
    console.error('Error in interviewNode:', error);
    return {
      conversationHistory: [
        ...state.conversationHistory,
        { role: 'assistant', content: 'Thank you for sharing that. Can you tell me more about your thoughts on this topic?' },
      ],
    };
  }
}

/**
 * Followup node - generates follow-up question for incomplete answers
 */
export async function followupNode(state: InterviewState): Promise<Partial<InterviewState>> {
  const userAnswer = stateUtils.extractUserAnswer(state);
  const followupType = state.followupType;
  const followupReason = state.followupReason;

  const systemPrompt = `You are conducting an interview and need to ask a follow-up question.

The user's previous answer: "${userAnswer || 'N/A'}"
Follow-up type: ${followupType || 'clarification'}
Reason: ${followupReason || 'Need more detail'}

Your task:
Ask a specific follow-up question that:
- If clarification: asks them to explain unclear points
- If deep: digs deeper into their reasoning
- If validation: asks for examples or evidence
- If expansion: asks them to elaborate on their thoughts

Be direct and specific to their answer.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...state.conversationHistory.slice(-4).map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await callLLM(messages);

    const assistantMessage: Message = {
      role: 'assistant',
      content: response,
    };

    // Clear followup state after asking
    return {
      conversationHistory: [...state.conversationHistory, assistantMessage],
      needsFollowup: null,
      followupType: null,
      followupReason: null,
    };
  } catch (error) {
    console.error('Error in followupNode:', error);
    return {
      conversationHistory: [
        ...state.conversationHistory,
        { role: 'assistant', content: 'Could you clarify that a bit more for me?' },
      ],
      needsFollowup: null,
      followupType: null,
      followupReason: null,
    };
  }
}

/**
 * Analyze node - generates final report
 */
export async function analyzeNode(state: InterviewState): Promise<Partial<InterviewState>> {
  const conversationText = state.conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  const systemPrompt = `You are an expert interviewer analyzing a completed interview about "${state.topic}".

The full conversation:
${conversationText}

Your task:
Write a comprehensive interview report that includes:
1. Executive Summary - key findings and overall assessment
2. Key Insights - main points discussed and takeaways
3. Recommendations - suggested actions or next steps
4. Conversation Log - brief summary of the dialogue flow

Format the report in clean markdown. Be thorough but concise.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  try {
    const report = await callLLM(messages);

    return {
      report,
      status: 'completed' as InterviewStatus,
    };
  } catch (error) {
    console.error('Error in analyzeNode:', error);
    return {
      report: '# Interview Report\n\nError generating report. Please review the conversation manually.',
      status: 'completed' as InterviewStatus,
    };
  }
}
