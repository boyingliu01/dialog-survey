// @ts-nocheck
import { InterviewEntity, InterviewStatus } from '../entities/interview.entity.js';

export class InterviewDomainService {
  canStartFollowup(interview: InterviewEntity): boolean {
    return (
      interview.followupCount < interview.maxFollowups &&
      interview.status === InterviewStatus.ACTIVE
    );
  }

  shouldGenerateFollowup(response: string): boolean {
    const vagueIndicators = [
      'maybe',
      'perhaps',
      'not sure',
      'could be',
      'might',
      'possibly',
      '一般',
      '可能',
      '也许',
      '不太确定',
    ];
    const lowerResponse = response.toLowerCase();
    return vagueIndicators.some((indicator) => lowerResponse.includes(indicator));
  }

  canMoveToNextQuestion(interview: InterviewEntity): boolean {
    return interview.status === InterviewStatus.ACTIVE;
  }

  isInterviewComplete(interview: InterviewEntity): boolean {
    return interview.status === InterviewStatus.COMPLETED;
  }
}
