import { Annotation } from '@langchain/langgraph';
import type { InterviewTemplate, Message } from './types';

/**
 * LangGraph state annotation for type-safe state updates.
 * This replaces the plain TypeScript interface with LangGraph's Annotation system,
 * which provides proper reducer semantics for state updates.
 */
export const InterviewStateAnnotation = Annotation.Root({
  // Session identifiers
  sessionId: Annotation<string>,
  templateId: Annotation<string>,
  template: Annotation<InterviewTemplate>,

  // Conversation state
  conversationHistory: Annotation<Message[]>,
  currentTopicIndex: Annotation<number>,
  currentQuestionIndex: Annotation<number>,
  answers: Annotation<Record<string, string>>,
  completedTopics: Annotation<string[]>,

  // Flow control
  interviewStatus: Annotation<'planning' | 'interviewing' | 'followup' | 'analyzing' | 'completed'>,
  followupNeeded: Annotation<boolean>,
  followupQuestion: Annotation<string | undefined>,

  // Timing
  startTime: Annotation<Date>,
  endTime: Annotation<Date | undefined>,

  // Output
  report: Annotation<string | undefined>,
  error: Annotation<string | undefined>,
});

/**
 * InterviewState type derived from the annotation.
 * This type is used throughout the application for type safety.
 */
export type InterviewState = typeof InterviewStateAnnotation.State;

/**
 * Create initial state for a new interview session.
 * This is the entry point for starting a new interview.
 */
export function createInitialState(
  sessionId: string,
  templateId: string,
  template: InterviewTemplate
): InterviewState {
  return {
    sessionId,
    templateId,
    template,
    conversationHistory: [],
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    answers: {},
    completedTopics: [],
    interviewStatus: 'planning',
    followupNeeded: false,
    followupQuestion: undefined,
    startTime: new Date(),
    endTime: undefined,
    report: undefined,
    error: undefined,
  };
}

/**
 * Update conversation history with a new message.
 * Returns a partial state update that can be merged with the current state.
 */
export function updateConversationHistory(
  state: InterviewState,
  message: Message
): Partial<InterviewState> {
  return {
    conversationHistory: [...state.conversationHistory, message],
  };
}

/**
 * Extract the last user answer from conversation history.
 * Used by interview nodes to get the user's latest response.
 */
export function extractUserAnswer(state: InterviewState): string | null {
  const userMessages = state.conversationHistory.filter(
    (msg) => msg.role === 'user'
  );
  const lastUserMessage = userMessages[userMessages.length - 1];
  return lastUserMessage ? lastUserMessage.content : null;
}