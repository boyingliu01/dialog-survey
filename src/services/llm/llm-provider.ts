import { LLMProvider, LLMResponse, LLMMessage } from "../../types";

export class MockLLMProvider implements LLMProvider {
  private responses: string[] = [
    "好的，让我来了解一下您的情况。",
    "非常感谢您的回答，这很有帮助。",
    "明白了，您能再详细说说吗？",
    "访谈报告已生成完毕。",
  ];
  private responseIndex = 0;

  // eslint-disable-next-line @typescript-eslint/require-await
  async chat(_messages: LLMMessage[]): Promise<LLMResponse> {
    const content = this.responses[this.responseIndex % this.responses.length];
    this.responseIndex++;

    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  setResponses(responses: string[]): void {
    this.responses = responses;
    this.responseIndex = 0;
  }
}

export class DummyLLMProvider implements LLMProvider {
  // eslint-disable-next-line @typescript-eslint/require-await
  async chat(_messages: LLMMessage[]): Promise<LLMResponse> {
    return {
      content: "This is a dummy response.",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}
