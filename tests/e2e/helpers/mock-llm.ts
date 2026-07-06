/**
 * Mock LLM helpers for E2E tests.
 *
 * Tests should use vi.mock to replace followup.service.js and control
 * generateSmartResponse / polishFirstQuestion outputs through these helpers.
 */

export interface QueuedResponse {
  action: 'NEXT' | 'FOLLOWUP' | 'END';
  response: string;
}

export interface SmartResponseResult {
  action: 'NEXT' | 'FOLLOWUP' | 'END';
  response: string;
  shouldProceedToNext: boolean;
  shouldEndInterview: boolean;
}

export class MockLLMQueue {
  private queue: QueuedResponse[] = [];
  private defaultResponse: QueuedResponse = {
    action: 'NEXT',
    response: '谢谢您的回答，我们继续。',
  };

  enqueue(response: QueuedResponse) {
    this.queue.push(response);
  }

  enqueueMany(responses: QueuedResponse[]) {
    this.queue.push(...responses);
  }

  dequeue(): SmartResponseResult {
    const next =
      this.queue.length > 0 ? (this.queue.shift() ?? this.defaultResponse) : this.defaultResponse;
    return {
      action: next.action,
      response: next.response,
      shouldProceedToNext: next.action === 'NEXT',
      shouldEndInterview: next.action === 'END',
    };
  }

  setDefault(response: QueuedResponse) {
    this.defaultResponse = response;
  }

  get remaining(): number {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
  }
}
