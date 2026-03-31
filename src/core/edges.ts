import { InterviewState } from '../types/index';

export function shouldContinue(state: InterviewState): 'interviewing' | 'followup' | 'analyzing' {
  if (state.needsFollowup) {
    return 'followup';
  }

  // Check if all topics are completed
  const allTopicsCompleted = state.currentTopicIndex >= state.topics.length;

  if (allTopicsCompleted) {
    return 'analyzing';
  }

  return 'interviewing';
}

export function shouldFollowup(state: InterviewState): boolean {
  return state.needsFollowup ?? false;
}

export function isInterviewComplete(state: InterviewState): boolean {
  const allTopicsCompleted = state.currentTopicIndex >= state.topics.length;
  return allTopicsCompleted;
}
