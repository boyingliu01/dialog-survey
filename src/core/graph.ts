import { InterviewState, InterviewStatus, LLMMessage } from '../types/index';
import { createInitialState } from './state';
import { planningNode, interviewNode, followupNode, analyzeNode } from './nodes';
import { shouldContinue, isInterviewComplete } from './edges';

// LLM Provider interface
interface LLMProvider {
  chat(messages: LLMMessage[]): Promise<string>;
}

export async function buildAndRunInterview(
  initialState: InterviewState,
  _llmProvider: LLMProvider
): Promise<InterviewState> {
  let state = { ...initialState };

  // Run planning node
  if (state.status === 'planning') {
    const planningResult = await planningNode(state);
    state = { ...state, ...planningResult };
  }

  // Main interview loop
  while (state.status !== 'completed' && state.status !== 'analyzing') {
    if (state.needsFollowup) {
      const followupResult = await followupNode(state);
      state = { ...state, ...followupResult };
    } else if (!isInterviewComplete(state)) {
      const interviewResult = await interviewNode(state);
      state = { ...state, ...interviewResult };

      // Check next step
      const nextStep = shouldContinue(state);
      if (nextStep === 'analyzing') {
        state.status = 'analyzing';
      }
    } else {
      state.status = 'analyzing';
    }
  }

  // Run analyze node
  if (state.status === 'analyzing') {
    const analyzeResult = await analyzeNode(state);
    state = { ...state, ...analyzeResult };
  }

  return state;
}

export async function runInterview(
  sessionId: string,
  userId: string,
  templateId: string,
  llmProvider: LLMProvider
): Promise<InterviewState> {
  const initialState = createInitialState(sessionId, templateId, userId);

  try {
    return await buildAndRunInterview(initialState, llmProvider);
  } catch (error) {
    return {
      ...initialState,
      status: 'completed' as InterviewStatus,
    };
  }
}

export async function runInterviewTurn(
  currentState: InterviewState,
  llmProvider: LLMProvider,
  timeoutMs: number = 30000
): Promise<InterviewState> {
  const timeoutPromise = new Promise<InterviewState>((_, reject) => {
    setTimeout(() => reject(new Error('Turn processing timeout')), timeoutMs);
  });

  const processingPromise = buildAndRunInterview(currentState, llmProvider);

  try {
    return await Promise.race([processingPromise, timeoutPromise]);
  } catch (error) {
    return {
      ...currentState,
    };
  }
}
