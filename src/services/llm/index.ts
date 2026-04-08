/**
 * LLM Service Module
 * Provides LLM provider implementations for the interview bot
 */

export { MockLLMProvider, DummyLLMProvider } from "./llm-provider";
export {
  DashScopeProvider,
  getDashScopeProvider,
  initializeDashScope,
  resetDashScopeProvider,
  setLLMProvider,
  type DashScopeConfig,
} from "./dashscope-provider";
export type {
  LLMProvider,
  LLMResponse,
  LLMMessage,
  LLMOptions,
} from "../../types";
