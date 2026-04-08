import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationEngine } from "../../src/services/conversation/engine";
import { InterviewRepository } from "../../src/repositories/interview";
import { resetGraphInstance } from "../../src/core/graph";
import type { InterviewTemplate } from "../../src/core/types";

vi.mock("../../src/repositories/interview");
vi.mock("../../src/core/graph");
vi.mock("../../src/services/llm");

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
  ],
  questions: [{ id: "q1", type: "text", text: "Question 1" }],
  domain_context: "Test domain",
};

describe("ConversationEngine - Multi-Turn Session Tests", () => {
  let engine: ConversationEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGraphInstance();
    engine = new ConversationEngine({ useLlm: false });
  });

  describe("startInterview", () => {
    it("should call InterviewRepository.create with correct parameters", async () => {
      const mockCreate = vi
        .mocked(InterviewRepository.create)
        .mockResolvedValueOnce({
          id: "test-id",
          sessionId: "test-session-123",
          userId: "user-001",
          templateId: "test-template",
          status: "IN_PROGRESS",
          conversationHistory: {},
          extractedInfo: {},
          version: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
        } as any);

      await engine.startInterview(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
      );

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        sessionId: "test-session-123",
        userId: "user-001",
        templateId: "test-template",
        topic: "Test Interview",
        conversationHistory: expect.any(Object),
        extractedInfo: expect.any(Object),
      });
    });

    it("should persist conversation history with initial state", async () => {
      let savedData: any = null;

      vi.mocked(InterviewRepository.create).mockImplementation(async (data) => {
        savedData = data;
        return {
          id: "test-id",
          ...data,
          status: "IN_PROGRESS",
          version: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
        } as any;
      });

      await engine.startInterview(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
      );

      expect(savedData).not.toBeNull();
      expect(savedData.conversationHistory).toBeDefined();

      const history = savedData.conversationHistory as any;
      expect(history.template).toEqual(mockTemplate);
      expect(history.messages).toBeDefined();
      expect(Array.isArray(history.messages)).toBe(true);
      expect(history.currentTopicIndex).toBe(0);
      expect(history.currentQuestionIndex).toBe(0);
      expect(history.completedTopics).toEqual([]);
    });

    it("should persist extracted info with empty answers", async () => {
      let savedData: any = null;

      vi.mocked(InterviewRepository.create).mockImplementation(async (data) => {
        savedData = data;
        return {
          id: "test-id",
          ...data,
          status: "IN_PROGRESS",
          version: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
        } as any;
      });

      await engine.startInterview(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
      );

      expect(savedData).not.toBeNull();
      expect(savedData.extractedInfo).toBeDefined();

      const info = savedData.extractedInfo as any;
      expect(info.answers).toEqual({});
    });
  });

  describe("processMessage - Session Recovery", () => {
    it("should query database for existing interview by sessionId", async () => {
      const mockFindBySessionId = vi
        .mocked(InterviewRepository.findBySessionId)
        .mockResolvedValueOnce(null);

      vi.mocked(InterviewRepository.withTransaction).mockImplementation(
        async (fn) => {
          return fn();
        },
      );

      vi.mocked(InterviewRepository.create).mockResolvedValue({
        id: "test-id",
        sessionId: "test-session-123",
        userId: "user-001",
        templateId: "test-template",
        status: "IN_PROGRESS",
        conversationHistory: {},
        extractedInfo: {},
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      } as any);

      await engine.processMessage(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
        "Test message",
      );

      expect(mockFindBySessionId).toHaveBeenCalledWith("test-session-123");
    });

    it("should deserialize state from database when interview exists", async () => {
      const existingInterview = {
        id: "existing-id",
        sessionId: "test-session-123",
        userId: "user-001",
        templateId: "test-template",
        status: "IN_PROGRESS",
        conversationHistory: {
          template: mockTemplate,
          messages: [{ role: "assistant", content: "Welcome!" }],
          currentTopicIndex: 0,
          currentQuestionIndex: 1,
          completedTopics: [],
        },
        extractedInfo: {
          answers: { q0_0: "Previous answer" },
        },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(InterviewRepository.findBySessionId).mockResolvedValueOnce(
        existingInterview as any,
      );

      vi.mocked(InterviewRepository.withTransaction).mockImplementation(
        async (fn) => {
          return fn();
        },
      );

      vi.mocked(InterviewRepository.updateWithVersion).mockResolvedValue({
        ...existingInterview,
        version: 2,
      } as any);

      const result = await engine.processMessage(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
        "New answer",
      );

      expect(result).toBeDefined();
      expect(InterviewRepository.updateWithVersion).toHaveBeenCalled();
    });

    it("should update existing interview (not create new one)", async () => {
      const existingInterview = {
        id: "existing-id",
        sessionId: "test-session-123",
        userId: "user-001",
        templateId: "test-template",
        status: "IN_PROGRESS",
        conversationHistory: {
          template: mockTemplate,
          messages: [{ role: "assistant", content: "Welcome!" }],
          currentTopicIndex: 0,
          currentQuestionIndex: 0,
          completedTopics: [],
        },
        extractedInfo: { answers: {} },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(InterviewRepository.findBySessionId).mockResolvedValueOnce(
        existingInterview as any,
      );

      vi.mocked(InterviewRepository.withTransaction).mockImplementation(
        async (fn) => {
          return fn();
        },
      );

      const mockUpdate = vi
        .mocked(InterviewRepository.updateWithVersion)
        .mockResolvedValue({
          ...existingInterview,
          version: 2,
        } as any);

      await engine.processMessage(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
        "Test answer",
      );

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(InterviewRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("processMessage - State Update", () => {
    it("should increment version on each update", async () => {
      const existingInterview = {
        id: "existing-id",
        sessionId: "test-session-123",
        userId: "user-001",
        templateId: "test-template",
        status: "IN_PROGRESS",
        conversationHistory: {
          template: mockTemplate,
          messages: [],
          currentTopicIndex: 0,
          currentQuestionIndex: 0,
          completedTopics: [],
        },
        extractedInfo: { answers: {} },
        version: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(InterviewRepository.findBySessionId).mockResolvedValueOnce(
        existingInterview as any,
      );

      vi.mocked(InterviewRepository.withTransaction).mockImplementation(
        async (fn) => {
          return fn();
        },
      );

      const mockUpdate = vi
        .mocked(InterviewRepository.updateWithVersion)
        .mockResolvedValue({
          ...existingInterview,
          version: 6,
        } as any);

      await engine.processMessage(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
        "Test",
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        "existing-id",
        expect.objectContaining({
          version: 5,
        }),
      );
    });

    it("should preserve previous answers when adding new answer", async () => {
      const existingInterview = {
        id: "existing-id",
        sessionId: "test-session-123",
        userId: "user-001",
        templateId: "test-template",
        status: "IN_PROGRESS",
        conversationHistory: {
          template: mockTemplate,
          messages: [
            { role: "assistant", content: "Welcome!" },
            { role: "user", content: "Answer 1" },
            { role: "assistant", content: "Next question" },
          ],
          currentTopicIndex: 0,
          currentQuestionIndex: 1,
          completedTopics: [],
        },
        extractedInfo: {
          answers: { q0_0: "Answer 1" },
        },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(InterviewRepository.findBySessionId).mockResolvedValueOnce(
        existingInterview as any,
      );

      vi.mocked(InterviewRepository.withTransaction).mockImplementation(
        async (fn) => {
          return fn();
        },
      );

      let savedData: any = null;
      vi.mocked(InterviewRepository.updateWithVersion).mockImplementation(
        async (id, data) => {
          savedData = data;
          return {
            ...existingInterview,
            ...data,
            version: 2,
          } as any;
        },
      );

      await engine.processMessage(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
        "Answer 2",
      );

      expect(savedData).not.toBeNull();
      const extractedInfo = savedData.extractedInfo as any;
      expect(extractedInfo.answers).toBeDefined();
    });
  });

  describe("Optimistic Locking", () => {
    it("should retry on OptimisticLockError", async () => {
      const existingInterview = {
        id: "existing-id",
        sessionId: "test-session-123",
        userId: "user-001",
        templateId: "test-template",
        status: "IN_PROGRESS",
        conversationHistory: {
          template: mockTemplate,
          messages: [],
          currentTopicIndex: 0,
          currentQuestionIndex: 0,
          completedTopics: [],
        },
        extractedInfo: { answers: {} },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(InterviewRepository.findBySessionId).mockResolvedValue(
        existingInterview as any,
      );

      vi.mocked(InterviewRepository.withTransaction).mockImplementation(
        async (fn) => {
          return fn();
        },
      );

      const mockUpdate = vi.mocked(InterviewRepository.updateWithVersion);

      mockUpdate
        .mockRejectedValueOnce(new Error("Optimistic lock failed"))
        .mockResolvedValueOnce({
          ...existingInterview,
          version: 2,
        } as any);

      const result = await engine.processMessage(
        "test-session-123",
        "user-001",
        "test-template",
        mockTemplate,
        "Test",
      );

      expect(result).toBeDefined();
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });
  });
});
