import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import "dotenv/config";
import {
  getConversationEngine,
  resetConversationEngine,
} from "../../src/services/conversation/engine.js";
import { InterviewRepository } from "../../src/repositories/interview.js";
import { resetGraphInstance } from "../../src/core/graph.js";
import {
  resetDashScopeProvider,
  setLLMProvider,
  MockLLMProvider,
} from "../../src/services/llm/index.js";
import type { InterviewTemplate } from "../../src/core/types.js";

const testTemplate: InterviewTemplate = {
  id: "test-multi-turn",
  name: "Multi-Turn Test",
  description: "Test multi-turn conversation persistence",
  topics: [
    {
      id: "topic-1",
      name: "Product Quality",
      description: "Product quality questions",
      initial_question: "How is the product quality?",
    },
    {
      id: "topic-2",
      name: "Service",
      description: "Service questions",
      initial_question: "How is the service?",
    },
  ],
  questions: [
    { id: "q1", type: "text", text: "Question 1" },
    { id: "q2", type: "text", text: "Question 2" },
    { id: "q3", type: "text", text: "Question 3" },
    { id: "q4", type: "text", text: "Question 4" },
  ],
  domain_context: "Customer feedback interview",
};

describe("Multi-Turn Interview - Real Database Tests", () => {
  const testSessionId = `test-multi-turn-${Date.now()}`;
  const testUserId = "test-user-real-db";

  beforeAll(async () => {
    try {
      await InterviewRepository.findAll(undefined, 1, 0);
    } catch (error) {
      console.error("Database connection failed:", error);
      throw new Error("Cannot connect to database.");
    }
  });

  beforeEach(() => {
    resetGraphInstance();
    resetDashScopeProvider();
    resetConversationEngine();
    setLLMProvider(new MockLLMProvider());
  });

  afterAll(async () => {
    try {
      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      if (interview) {
        await InterviewRepository.delete(interview.id);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Turn 1: Start Interview", () => {
    it("should create interview record and persist to database", async () => {
      const engine = getConversationEngine({ useLlm: true });

      const greeting = await engine.startInterview(
        testSessionId,
        testUserId,
        "test-multi-turn",
        testTemplate,
      );

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);

      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();
      expect(saved!.sessionId).toBe(testSessionId);
      expect(saved!.userId).toBe(testUserId);
      expect(saved!.templateId).toBe("test-multi-turn");
      expect(saved!.status).toBe("IN_PROGRESS");
    });

    it("should persist initial conversation history", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      expect(history).toBeDefined();
      expect(history.messages).toBeDefined();
      expect(Array.isArray(history.messages)).toBe(true);
      expect(history.messages.length).toBeGreaterThan(0);
    });

    it("should persist state indices", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      expect(history.currentTopicIndex).toBe(0);
      expect(history.currentQuestionIndex).toBe(0);
      expect(history.completedTopics).toEqual([]);
    });

    it("should persist template object", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      expect(history.template).toBeDefined();
      expect(history.template.id).toBe("test-multi-turn");
      expect(history.template.topics).toHaveLength(2);
      expect(history.template.questions).toHaveLength(4);
    });
  });

  describe("Turn 2: Continue Interview", () => {
    it("should recover session state from database", async () => {
      const engine = getConversationEngine({ useLlm: true });

      const existing = await InterviewRepository.findBySessionId(testSessionId);
      expect(existing).not.toBeNull();
      expect(existing!.sessionId).toBe(testSessionId);

      const response = await engine.processMessage(
        testSessionId,
        testUserId,
        "test-multi-turn",
        testTemplate,
        "产品质量很好，性能稳定",
      );

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should update conversation history", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      expect(history.messages.length).toBeGreaterThanOrEqual(3);
    });

    it("should store user answer to extractedInfo", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const info = saved!.extractedInfo as any;
      expect(info.answers).toBeDefined();
      expect(Object.keys(info.answers).length).toBeGreaterThan(0);

      const answerKeys = Object.keys(info.answers);
      expect(answerKeys[0]).toMatch(/^q\d+_\d+$/);
    });

    it("should update currentQuestionIndex", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      expect(history.currentQuestionIndex).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Turn 3: Continue Conversation", () => {
    it("should continue adding messages", async () => {
      const engine = getConversationEngine({ useLlm: true });

      const response = await engine.processMessage(
        testSessionId,
        testUserId,
        "test-multi-turn",
        testTemplate,
        "服务响应很快，态度很好",
      );

      expect(response).toBeDefined();
    });

    it("should accumulate conversation history", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      expect(history.messages.length).toBeGreaterThanOrEqual(5);
    });

    it("should accumulate user answers", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const info = saved!.extractedInfo as any;
      expect(Object.keys(info.answers).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Multi-Turn State Consistency", () => {
    it("should update version field on each turn", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      expect(saved!.version).toBeGreaterThanOrEqual(2);
    });

    it("all messages should have valid roles", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      const messages = history.messages;

      for (const msg of messages) {
        expect(["user", "assistant", "system"]).toContain(msg.role);
      }
    });

    it("answer index should be consistent with question index", async () => {
      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      const info = saved!.extractedInfo as any;

      const currentIndex = history.currentQuestionIndex;
      const answerCount = Object.keys(info.answers).length;

      expect(answerCount).toBeLessThanOrEqual(currentIndex + 1);
    });
  });

  describe("Session Recovery Verification", () => {
    it("new engine instance should recover session state", async () => {
      resetConversationEngine();
      setLLMProvider(new MockLLMProvider());
      const newEngine = getConversationEngine({ useLlm: true });

      const response = await newEngine.processMessage(
        testSessionId,
        testUserId,
        "test-multi-turn",
        testTemplate,
        "新实例处理的消息",
      );

      expect(response).toBeDefined();

      const saved = await InterviewRepository.findBySessionId(testSessionId);
      expect(saved).not.toBeNull();

      const history = saved!.conversationHistory as any;
      const info = saved!.extractedInfo as any;

      expect(Object.keys(info.answers).length).toBeGreaterThanOrEqual(3);
      expect(history.messages.length).toBeGreaterThanOrEqual(7);
    });
  });
});
