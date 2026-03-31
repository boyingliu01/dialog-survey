import { InterviewState, Message } from '../types';

export function createInitialState(
  sessionId: string,
  templateId: string,
  userId: string
): InterviewState {
  return {
    sessionId,
    templateId,
    userId,
    conversationHistory: [],
    currentTopicIndex: 0,
    extractedInfo: {},
    topics: [],
    topic: '',
    domainContext: '',
    status: 'planning',
    followupCount: {},
    pendingQuestion: null,
    needsFollowup: null,
    followupType: null,
    followupReason: null,
    report: null,
    reportPath: null,
    personaConfig: null,
  };
}

export function updateConversationHistory(
  state: InterviewState,
  message: Message
): InterviewState {
  return {
    ...state,
    conversationHistory: [...state.conversationHistory, message],
  };
}

export function extractUserAnswer(state: InterviewState): string | null {
  const userMessages = state.conversationHistory.filter(
    (msg) => msg.role === 'user'
  );
  const lastUserMessage = userMessages[userMessages.length - 1];
  return lastUserMessage ? lastUserMessage.content : null;
}

export function getCurrentTopic(state: InterviewState): any {
  if (state.topics && state.topics.length > 0) {
    return state.topics[state.currentTopicIndex] || null;
  }
  return null;
}
