import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from '../../../src/services/messageHandler';
import { DingTalkService } from '../../../src/services/dingtalk';
import { TemplateLoader } from '../../../src/services/templateLoader';
import { CallbackMessage } from '../../../src/services/dingtalk/types';

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;
  let mockDingTalkService: Partial<DingTalkService>;
  let mockTemplateLoader: Partial<TemplateLoader>;

  beforeEach(() => {
    // Create mock dependencies
    mockDingTalkService = {
      sendToConversation: vi.fn().mockResolvedValue({ errcode: 0, errmsg: 'ok' }),
    };

    mockTemplateLoader = {
      listTemplates: vi.fn().mockResolvedValue([
        {
          id: 'testTemplate',
          name: 'Test Interview',
          description: 'A test interview template',
          topics: [
            {
              id: 'topic1',
              name: 'Test Topic',
              description: 'Test topic description',
              initial_question: 'Initial question',
            },
          ],
          questions: [
            {
              id: 'q1',
              type: 'text',
              text: 'First question',
            },
          ],
        },
      ]),
    };

    messageHandler = new MessageHandler(
      mockDingTalkService as unknown as DingTalkService,
      mockTemplateLoader as unknown as TemplateLoader
    );
  });

  describe('handleChatMessage', () => {
    it('should start new interview for new session', async () => {
      const mockMessage: CallbackMessage = {
        msgId: '1',
        createAt: Date.now(),
        senderStaffId: 'user1',
        conversationId: 'conv1',
        conversationType: '1',
        senderCorpId: 'corp1',
        conversationTitle: 'Test Conversation',
        msgtype: 'text',
        text: { content: 'Hello' },
      };

      await messageHandler.handleChatMessage(mockMessage);

      expect(mockTemplateLoader.listTemplates).toHaveBeenCalled();
      expect(mockDingTalkService.sendToConversation).toHaveBeenCalled();
    });

    it('should continue existing interview', async () => {
      const mockMessage: CallbackMessage = {
        msgId: '1',
        createAt: Date.now(),
        senderStaffId: 'user1',
        conversationId: 'conv1',
        conversationType: '1',
        senderCorpId: 'corp1',
        conversationTitle: 'Test Conversation',
        msgtype: 'text',
        text: { content: 'Hello' },
      };

      // Create session manually for testing
      // @ts-expect-error Accessing private property
      messageHandler['sessions'].set('session1', {
        id: 'session1',
        userId: 'user1',
        conversationId: 'conv1',
        template: {
          id: 'testTemplate',
          name: 'Test Interview',
          description: 'A test interview template',
          topics: [
            {
              id: 'topic1',
              name: 'Test Topic',
              description: 'Test topic description',
              initial_question: 'Initial question',
            },
          ],
          questions: [
            {
              id: 'q1',
              type: 'text',
              text: 'First question',
            },
          ],
        },
        currentTopicIndex: 0,
        currentQuestionIndex: 0,
        answers: {},
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      });

      await messageHandler.handleChatMessage(mockMessage);

      expect(mockDingTalkService.sendToConversation).toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    it('should create and retrieve active sessions', async () => {
      const activeSessionsBefore = messageHandler.getActiveSessions();
      expect(activeSessionsBefore.length).toBe(0);

      // Create session manually
      // @ts-expect-error Accessing private property
      messageHandler['sessions'].set('session1', {
        id: 'session1',
        userId: 'user1',
        conversationId: 'conv1',
        template: {
          id: 'testTemplate',
          name: 'Test Interview',
          description: 'A test interview template',
          topics: [
            {
              id: 'topic1',
              name: 'Test Topic',
              description: 'Test topic description',
              initial_question: 'Initial question',
            },
          ],
          questions: [
            {
              id: 'q1',
              type: 'text',
              text: 'First question',
            },
          ],
        },
        currentTopicIndex: 0,
        currentQuestionIndex: 0,
        answers: {},
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      });

      const activeSessions = messageHandler.getActiveSessions();
      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0].id).toBe('session1');

      const sessionById = messageHandler.getSessionById('session1');
      expect(sessionById).not.toBeUndefined();
      expect(sessionById?.id).toBe('session1');
    });
  });
});
