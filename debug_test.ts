import { createInitialState } from './src/core/state';
import { shouldContinue, isInterviewComplete } from './src/core/edges';
import { InterviewState } from './src/core/types';

const state: InterviewState = {
  ...createInitialState({
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    templateId: 'test-template-id'
  }),
  needsFollowup: false,
  topics: [
    { id: 'topic1', name: 'Topic 1' },
    { id: 'topic2', name: 'Topic 2' }
  ],
  currentTopicIndex: 2
};

console.log('State:', state);
console.log('isInterviewComplete:', isInterviewComplete(state));
console.log('shouldContinue:', shouldContinue(state));
