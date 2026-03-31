import type { InterviewState } from './state';

export function shouldContinue(state: InterviewState): 'interviewing' | 'followup' | 'analyzing' {
  if (state.followupNeeded) {
    return 'followup';
  }

  const totalTopics = state.template.topics.length;
  const allTopicsCompleted = state.completedTopics.length >= totalTopics;

  if (allTopicsCompleted) {
    return 'analyzing';
  }

  return 'interviewing';
}

export function shouldFollowup(state: InterviewState): boolean {
  return state.followupNeeded;
}

export function isInterviewComplete(state: InterviewState): boolean {
  const totalTopics = state.template.topics.length;
  return state.completedTopics.length >= totalTopics;
}
