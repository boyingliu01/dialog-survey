import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getConversationEngine,
  resetConversationEngine,
} from "../../src/services/conversation/engine";
import { InterviewRepository } from "../../src/repositories/interview";
import { resetGraphInstance } from "../../src/core/graph";
import { resetDashScopeProvider } from "../../src/services/llm";
import type { InterviewTemplate } from "../../src/core/types";

/**
 * Multi-Turn Interview Integration Tests
 *
 * These tests verify the complete multi-turn conversation flow,
 * including session persistence and state recovery from database.
 *
 * TDD Approach:
 * 1. Write test that exposes the issue
 * 2. Run test to see failure
 * 3. Fix the code
 * 4. Verify test passes
 */

const mockTemplate: InterviewTemplate = {
  id: "test-template",
  name: "Test Interview",
  description: "Test Description",
  topics: [
    {
      id: "topic-1",
      name: "Topic 1",
      description: "Topic 1 Description",
      initial_question: "Question 1?",
    },
    {
      id: "topic-2",
      name: "Topic 2",
      description: "Topic 2 Description",
      initial_question: "Question 2?",
    },
  ],
  questions: [
    { id: "q1", type: "text", text: "Question 1" },
    { id: "q2", type: "text", text: "Question 2" },
  ],
  domain_context: "Test domain context",
};

describe("Multi-Turn Interview Integration", () => {
  const testSessionId = `test-session-${Date.now()}`;
  const testUserId = "test-user-001";

  beforeEach(() => {
    // Reset all singletons
    resetGraphInstance();
    resetDashScopeProvider();
    resetConversationEngine();
  });

  afterEach(async () => {
    // Cleanup test data
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

  describe("Session Persistence", () => {
    it("should persist interview state to database after startInterview", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Start interview
      const greeting = await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);

      // Verify database has the record
      const savedInterview =
        await InterviewRepository.findBySessionId(testSessionId);

      expect(savedInterview).not.toBeNull();
      expect(savedInterview!.sessionId).toBe(testSessionId);
      expect(savedInterview!.userId).toBe(testUserId);
      expect(savedInterview!.templateId).toBe("test-template");
      expect(savedInterview!.status).toBe("IN_PROGRESS");
    });

    it("should persist conversation history to database", async () => {
      const engine = getConversationEngine({ useLlm: false });

      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      const savedInterview =
        await InterviewRepository.findBySessionId(testSessionId);

      expect(savedInterview).not.toBeNull();
      expect(savedInterview!.conversationHistory).toBeDefined();

      // Check conversation history structure
      const history = savedInterview!.conversationHistory as any;
      expect(history.messages).toBeDefined();
      expect(Array.isArray(history.messages)).toBe(true);
      expect(history.messages.length).toBeGreaterThan(0);
      expect(history.messages[0].role).toBe("assistant");
    });

    it("should persist state indices to database", async () => {
      const engine = getConversationEngine({ useLlm: false });

      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      const savedInterview =
        await InterviewRepository.findBySessionId(testSessionId);

      expect(savedInterview).not.toBeNull();

      const history = savedInterview!.conversationHistory as any;
      expect(history.currentTopicIndex).toBe(0);
      expect(history.currentQuestionIndex).toBe(0);
      expect(history.completedTopics).toEqual([]);
    });
  });

  describe("Session Recovery", () => {
    it("should find existing interview by sessionId", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Create interview
      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      // Find it again
      const found = await InterviewRepository.findBySessionId(testSessionId);

      expect(found).not.toBeNull();
      expect(found!.sessionId).toBe(testSessionId);
    });

    it("should recover state from database on processMessage", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Start interview
      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      // Get initial state
      const initialInterview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(initialInterview).not.toBeNull();

      const initialHistory = initialInterview!.conversationHistory as any;
      const initialMessageCount = initialHistory.messages.length;

      // Process a follow-up message
      const response = await engine.processMessage(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
        "This is my first answer",
      );

      expect(response).toBeDefined();

      // Verify state was updated
      const updatedInterview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(updatedInterview).not.toBeNull();

      const updatedHistory = updatedInterview!.conversationHistory as any;
      expect(updatedHistory.messages.length).toBeGreaterThan(
        initialMessageCount,
      );
    });

    it("should increment question index after processing answer", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Start interview
      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      // Process first answer
      await engine.processMessage(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
        "Answer to question 1",
      );

      // Check indices updated
      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(interview).not.toBeNull();

      const history = interview!.conversationHistory as any;
      // Should have moved to next question
      expect(history.currentQuestionIndex).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Multi-Turn Conversation Flow", () => {
    it("should maintain conversation across multiple turns", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Turn 1: Start interview
      const greeting = await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      expect(greeting).toContain("欢迎");

      // Verify Turn 1 state
      const afterTurn1 =
        await InterviewRepository.findBySessionId(testSessionId);
      const history1 = afterTurn1!.conversationHistory as any;
      const messagesAfterTurn1 = history1.messages.length;

      // Turn 2: First answer
      const response2 = await engine.processMessage(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
        "My first answer",
      );

      expect(response2).toBeDefined();

      // Verify Turn 2 state
      const afterTurn2 =
        await InterviewRepository.findBySessionId(testSessionId);
      const history2 = afterTurn2!.conversationHistory as any;
      expect(history2.messages.length).toBeGreaterThan(messagesAfterTurn1);

      // Turn 3: Second answer
      const response3 = await engine.processMessage(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
        "My second answer",
      );

      expect(response3).toBeDefined();

      // Verify Turn 3 state
      const afterTurn3 =
        await InterviewRepository.findBySessionId(testSessionId);
      const history3 = afterTurn3!.conversationHistory as any;
      expect(history3.messages.length).toBeGreaterThan(
        history2.messages.length,
      );

      // Verify answers were stored
      const extractedInfo = afterTurn3!.extractedInfo as any;
      expect(extractedInfo.answers).toBeDefined();
      expect(Object.keys(extractedInfo.answers).length).toBeGreaterThan(0);
    });

    it("should preserve template across turns", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Start with template
      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      // Process message
      await engine.processMessage(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
        "Test answer",
      );

      // Verify template is still present
      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(interview).not.toBeNull();

      const history = interview!.conversationHistory as any;
      expect(history.template).toBeDefined();
      expect(history.template.id).toBe("test-template");
      expect(history.template.topics).toHaveLength(2);
      expect(history.template.questions).toHaveLength(2);
    });

    it("should handle concurrent updates with optimistic locking", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Start interview
      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      // Process two messages in quick succession
      const [response1, response2] = await Promise.all([
        engine.processMessage(
          testSessionId,
          testUserId,
          "test-template",
          mockTemplate,
          "Concurrent answer 1",
        ),
        engine.processMessage(
          testSessionId,
          testUserId,
          "test-template",
          mockTemplate,
          "Concurrent answer 2",
        ),
      ]);

      // Both should succeed (one will retry due to optimistic lock)
      expect(response1).toBeDefined();
      expect(response2).toBeDefined();

      // Verify final state
      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(interview).not.toBeNull();

      const history = interview!.conversationHistory as any;
      // Both messages should be in history
      expect(history.messages.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("State Deserialization", () => {
    it("should correctly deserialize conversation history", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Start and process messages
      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      await engine.processMessage(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
        "Test answer",
      );

      // Get from database
      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(interview).not.toBeNull();

      // Verify all expected fields are present
      const history = interview!.conversationHistory as any;
      expect(history.template).toBeDefined();
      expect(history.messages).toBeDefined();
      expect(history.currentTopicIndex).toBeDefined();
      expect(history.currentQuestionIndex).toBeDefined();
      expect(history.completedTopics).toBeDefined();

      // Verify types
      expect(typeof history.currentTopicIndex).toBe("number");
      expect(typeof history.currentQuestionIndex).toBe("number");
      expect(Array.isArray(history.messages)).toBe(true);
      expect(Array.isArray(history.completedTopics)).toBe(true);
    });

    it("should correctly deserialize extracted info (answers)", async () => {
      const engine = getConversationEngine({ useLlm: false });

      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      await engine.processMessage(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
        "My detailed answer",
      );

      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(interview).not.toBeNull();

      const extractedInfo = interview!.extractedInfo as any;
      expect(extractedInfo.answers).toBeDefined();
      expect(typeof extractedInfo.answers).toBe("object");

      // Check that answer was stored with correct key format
      const answerKeys = Object.keys(extractedInfo.answers);
      expect(answerKeys.length).toBeGreaterThan(0);
      expect(answerKeys[0]).toMatch(/^q\d+_\d+$/); // Format: q{topicIndex}_{questionIndex}
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent sessionId gracefully", async () => {
      const engine = getConversationEngine({ useLlm: false });

      // Try to process message for non-existent session
      // This should create a new interview
      const response = await engine.processMessage(
        "non-existent-session",
        testUserId,
        "test-template",
        mockTemplate,
        "Test message",
      );

      expect(response).toBeDefined();

      // Verify new interview was created
      const interview = await InterviewRepository.findBySessionId(
        "non-existent-session",
      );
      expect(interview).not.toBeNull();

      // Cleanup
      if (interview) {
        await InterviewRepository.delete(interview.id);
      }
    });

    it("should handle empty conversation history", async () => {
      const engine = getConversationEngine({ useLlm: false });

      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(interview).not.toBeNull();

      const history = interview!.conversationHistory as any;
      // Should have at least the greeting message
      expect(history.messages.length).toBeGreaterThan(0);
    });

    it("should handle large conversation history", async () => {
      const engine = getConversationEngine({ useLlm: false });

      await engine.startInterview(
        testSessionId,
        testUserId,
        "test-template",
        mockTemplate,
      );

      // Process multiple messages
      for (let i = 0; i < 10; i++) {
        await engine.processMessage(
          testSessionId,
          testUserId,
          "test-template",
          mockTemplate,
          `Answer ${i}`,
        );
      }

      const interview =
        await InterviewRepository.findBySessionId(testSessionId);
      expect(interview).not.toBeNull();

      const history = interview!.conversationHistory as any;
      // Should have greeting + 10 user messages + 10 assistant responses
      expect(history.messages.length).toBeGreaterThanOrEqual(20);
    });
  });
});
