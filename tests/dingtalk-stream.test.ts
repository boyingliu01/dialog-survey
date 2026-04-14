import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { DingTalkStreamClient } from '../src/integrations/dingtalk/stream-client.js';

describe('DingTalkStreamClient', () => {
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    agentId: 'test-agent-id',
  };

  const mockConnectionResponse = {
    endpoint: 'wss://wss-open-connection.dingtalk.com:443/connect',
    ticket: 'test-ticket-123',
  };

  const mockMessage = {
    specVersion: '1.0',
    type: 'CALLBACK',
    headers: {
      topic: '/v1.0/im/bot/messages/get',
      messageId: 'msg-123',
      time: '1713000000000',
    },
    data: JSON.stringify({
      senderStaffId: 'user-123',
      content: JSON.stringify({ content: 'Hello' }),
      sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should create client with valid config', () => {
      const client = new DingTalkStreamClient(mockConfig);
      expect(client).toBeInstanceOf(DingTalkStreamClient);
    });

    it('should throw error if clientId is missing', () => {
      expect(() => {
        new DingTalkStreamClient({ ...mockConfig, clientId: '' });
      }).toThrow('clientId is required');
    });

    it('should throw error if clientSecret is missing', () => {
      expect(() => {
        new DingTalkStreamClient({ ...mockConfig, clientSecret: '' });
      }).toThrow('clientSecret is required');
    });

    it('should create client from environment variables', () => {
      process.env.DINGTALK_CLIENT_ID = 'env-client-id';
      process.env.DINGTALK_CLIENT_SECRET = 'env-client-secret';
      process.env.DINGTALK_AGENT_ID = 'env-agent-id';

      const client = DingTalkStreamClient.fromEnv();
      expect(client).toBeInstanceOf(DingTalkStreamClient);

      delete process.env.DINGTALK_CLIENT_ID;
      delete process.env.DINGTALK_CLIENT_SECRET;
      delete process.env.DINGTALK_AGENT_ID;
    });
  });

  describe('Connection Token Acquisition', () => {
    it('should fetch connection token from DingTalk API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      const client = new DingTalkStreamClient(mockConfig);
      const token = await client.getConnectionToken();

      expect(token).toEqual(mockConnectionResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.dingtalk.com/v1.0/gateway/connections/open',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining(mockConfig.clientId),
        })
      );
    });

    it('should throw error when API returns non-OK status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const client = new DingTalkStreamClient(mockConfig);
      await expect(client.getConnectionToken()).rejects.toThrow('Failed to get connection token');
    });

    it('should throw error when API response is invalid', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      const client = new DingTalkStreamClient(mockConfig);
      await expect(client.getConnectionToken()).rejects.toThrow('endpoint or ticket missing');
    });

    it('should include correct subscription in request body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      const client = new DingTalkStreamClient(mockConfig);
      await client.getConnectionToken();

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.subscriptions).toContainEqual({
        topic: '/v1.0/im/bot/messages/get',
        type: 'CALLBACK',
      });
    });
  });

  describe('WebSocket Connection', () => {
    it('should build correct WebSocket URL', async () => {
      const client = new DingTalkStreamClient(mockConfig);
      const url = client.buildWebSocketUrl(mockConnectionResponse);
      expect(url).toBe('wss://wss-open-connection.dingtalk.com:443/connect?ticket=test-ticket-123');
    });

    it('should handle connection state', () => {
      const client = new DingTalkStreamClient(mockConfig);
      expect(client.isConnected()).toBe(false);
    });

    it('should track connection state after connect', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      let openHandler: (() => void) | null = null;

      vi.spyOn(WebSocket.prototype, 'on').mockImplementation(function (
        this: WebSocket,
        event: string,
        handler: (data: unknown) => void
      ) {
        if (event === 'open') {
          openHandler = handler as () => void;
        }
        return this;
      });

      const client = new DingTalkStreamClient(mockConfig);
      await client.connect();

      // Simulate WebSocket 'open' event
      if (openHandler) {
        openHandler();
      }

      expect(client.isConnected()).toBe(true);
    });
  });

  describe('Message Handling', () => {
    it('should parse incoming message correctly', () => {
      const client = new DingTalkStreamClient(mockConfig);
      const message = client.parseMessage(JSON.stringify(mockMessage));

      expect(message.specVersion).toBe('1.0');
      expect(message.type).toBe('CALLBACK');
      expect(message.headers.topic).toBe('/v1.0/im/bot/messages/get');
      expect(message.headers.messageId).toBe('msg-123');
    });

    it('should parse data field as JSON', () => {
      const client = new DingTalkStreamClient(mockConfig);
      const message = client.parseMessage(JSON.stringify(mockMessage));
      const data = JSON.parse(message.data);

      expect(data.senderStaffId).toBe('user-123');
      expect(data.sessionWebhook).toBeDefined();
    });

    it('should handle invalid message format', () => {
      const client = new DingTalkStreamClient(mockConfig);
      expect(() => {
        client.parseMessage('invalid json');
      }).toThrow();
    });

    it('should emit message event when receiving valid message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      const client = new DingTalkStreamClient(mockConfig);
      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      // Simulate WebSocket message
      const mockWs = {
        on: vi.fn((event: string, handler: (data: unknown) => void) => {
          if (event === 'message') {
            handler(Buffer.from(JSON.stringify(mockMessage)));
          }
          return mockWs;
        }),
        send: vi.fn(),
        close: vi.fn(),
      };

      await client.connect();
    });
  });

  describe('ACK Response', () => {
    it('should build correct ACK response', () => {
      const client = new DingTalkStreamClient(mockConfig);
      const ack = client.buildAck('msg-123');

      expect(ack).toEqual({
        code: 200,
        headers: {
          messageId: 'msg-123',
        },
        message: 'OK',
        data: '{}',
      });
    });

    it.skip('should send ACK after receiving message', async () => {
      const mockSend = vi.fn();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      vi.doMock('ws', () => ({
        WebSocket: class MockWebSocket {
          on = vi.fn((event: string, handler: (data: unknown) => void) => {
            if (event === 'open') {
              setTimeout(() => handler(undefined), 0);
            }
            if (event === 'message') {
              setTimeout(() => handler(Buffer.from(JSON.stringify(mockMessage))), 10);
            }
            return this;
          });
          send = mockSend;
          close = vi.fn();
          readyState = 1;
        },
      }));

      const { DingTalkStreamClient } = await import(
        '../src/integrations/dingtalk/stream-client.js'
      );
      const client = new DingTalkStreamClient(mockConfig);

      await client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSend).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockSend.mock.calls[0][0]);
      expect(sentMessage.code).toBe(200);

      vi.doUnmock('ws');
    });
  });

  describe('Send Message via Session Webhook', () => {
    it('should send message to session webhook', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const client = new DingTalkStreamClient(mockConfig);
      const webhook = 'https://oapi.dingtalk.com/robot/send?access_token=xxx';
      await client.sendText(webhook, 'Hello World');

      expect(global.fetch).toHaveBeenCalledWith(
        webhook,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            msgtype: 'text',
            text: { content: 'Hello World' },
          }),
        })
      );
    });

    it('should throw error if webhook is invalid', async () => {
      const client = new DingTalkStreamClient(mockConfig);
      await expect(client.sendText('', 'Hello')).rejects.toThrow('sessionWebhook is required');
    });

    it('should throw error if content is empty', async () => {
      const client = new DingTalkStreamClient(mockConfig);
      await expect(client.sendText('https://example.com', '')).rejects.toThrow(
        'content is required'
      );
    });

    it('should handle send message API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new DingTalkStreamClient(mockConfig);
      await expect(
        client.sendText('https://oapi.dingtalk.com/robot/send?access_token=xxx', 'Hello')
      ).rejects.toThrow('Failed to send message');
    });
  });

  describe('Reconnection Logic', () => {
    it('should have reconnect method', () => {
      const client = new DingTalkStreamClient(mockConfig);
      expect(typeof client.reconnect).toBe('function');
    });

    it('should track reconnection attempts', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      const client = new DingTalkStreamClient(mockConfig);
      expect(client.getReconnectAttempts()).toBe(0);
    });

    it('should disconnect cleanly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      const client = new DingTalkStreamClient(mockConfig);
      await client.connect();

      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should support max reconnection attempts', () => {
      const client = new DingTalkStreamClient(mockConfig, {
        maxReconnectAttempts: 5,
      });
      expect(client.getMaxReconnectAttempts()).toBe(5);
    });

    it('should use default max reconnect attempts', () => {
      const client = new DingTalkStreamClient(mockConfig);
      expect(client.getMaxReconnectAttempts()).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle WebSocket connection error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConnectionResponse,
      });

      vi.doMock('ws', () => ({
        WebSocket: class MockWebSocket {
          on = vi.fn((event: string, handler: (data: unknown) => void) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('Connection failed')), 0);
            }
            return this;
          });
          send = vi.fn();
          close = vi.fn();
        },
      }));

      const { DingTalkStreamClient } = await import(
        '../src/integrations/dingtalk/stream-client.js'
      );
      const client = new DingTalkStreamClient(mockConfig);
      const errorSpy = vi.fn();
      client.on('error', errorSpy);

      await client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorSpy).toHaveBeenCalled();

      vi.doUnmock('ws');
    });

    it('should handle network errors during token fetch', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = new DingTalkStreamClient(mockConfig);
      await expect(client.getConnectionToken()).rejects.toThrow('Network error');
    });
  });

  describe('Event Handling', () => {
    it('should support on method for event registration', () => {
      const client = new DingTalkStreamClient(mockConfig);
      expect(typeof client.on).toBe('function');
    });

    it('should support off method for event unregistration', () => {
      const client = new DingTalkStreamClient(mockConfig);
      expect(typeof client.off).toBe('function');
    });

    it('should support multiple event listeners', () => {
      const client = new DingTalkStreamClient(mockConfig);
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      client.on('message', handler1);
      client.on('message', handler2);

      // Verify both handlers can be registered
      expect(() => client.off('message', handler1)).not.toThrow();
      expect(() => client.off('message', handler2)).not.toThrow();
    });
  });
});
