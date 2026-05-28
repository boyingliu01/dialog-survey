// @ts-nocheck
import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
import { DingTalkStreamClient } from '../src/integrations/dingtalk/stream-client.js';

// Define this at the top level for availability during module setup
class MockWebSocket {
  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN; // Default to OPEN state
    this.send = vi.fn();
    this.close = vi.fn();
    this._onCallbacks = new Map();
  }

  url: string;
  readyState: number;
  send: any;
  close: any;
  _onCallbacks: Map<string, Function>;

  on(event: string, callback: (...args: any[]) => void) {
    this._onCallbacks.set(event, callback);
    return this; // Allow chaining
  }

  // Method to manually trigger events (for testing purposes)
  emit(event: string, ...args: any[]) {
    const callback = this._onCallbacks.get(event);
    if (callback && typeof callback === 'function') {
      callback.call(this, ...args);
    }
  }

  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
}

// Now properly mock the WebSocket by assigning to the global scope in a way Vitest can handle
vi.stubGlobal('WebSocket', MockWebSocket);

// Mock fetch globally
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ endpoint: 'wss://test.com', ticket: 'test-ticket' }),
  })
) as any;

describe('DingTalkStreamClient Branch Coverage', () => {
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    agentId: 'test-agent-id',
  };

  const mockConnectionResponse = {
    endpoint: 'wss://wss-open-connection.dingtalk.com:443/connect',
    ticket: 'test-ticket-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockConnectionResponse,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * @test REQ-002-8-04
   * @intent 验证handleMessage在解析消息失败时发出错误事件
   */
  it('should emit error when handleMessage cannot parse incoming message', async () => {
    // Mock WebSocket that will be used
    const MockConstructor = vi.fn((url: string) => {
      const ws = new MockWebSocket(url);
      return ws;
    });

    vi.stubGlobal('WebSocket', MockConstructor);

    const client = new DingTalkStreamClient(mockConfig);
    const mockBuffer = Buffer.from('invalid json');

    // Set up error listener
    const errorHandler = vi.fn();
    client.on('error', errorHandler);

    // Spy on parseMessage to throw an error when called
    const spyParseMessage = vi.spyOn(client, 'parseMessage').mockImplementation(() => {
      throw new Error('Invalid JSON');
    });

    await client.connect();

    // Get the created websocket instance to manually trigger an event
    const createdWsResult = MockConstructor.mock.results[0]?.value;
    if (createdWsResult) {
      const createdWsInstance = createdWsResult as MockWebSocket;

      // Manually trigger the message event - the client is listening internally via ws.on('message')
      // Need to access the internal registration of 'message' handlers
      setTimeout(() => {
        if (createdWsInstance._onCallbacks.has('message')) {
          const messageCallback = createdWsInstance._onCallbacks.get('message');
          if (messageCallback) {
            messageCallback(mockBuffer);
          }
        }
      }, 0);
    }

    // Wait a bit for the async operation to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify that the error event was emitted
    // Wait for promise resolution
    await new Promise(process.nextTick);
    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    if (errorHandler.mock.calls.length > 0) {
      expect(errorHandler.mock.calls[0][0].message).toBe('Invalid JSON');
    }
    spyParseMessage.mockRestore();
  });

  /**
   * @test REQ-002-8-05
   * @intent 验证当WebSocket未处于OPEN状态时sendAck不会发送ACK
   */
  it('should not send ACK when WebSocket readyState is not OPEN', async () => {
    const client = new DingTalkStreamClient(mockConfig);

    // Mock WebSocket with non-OPEN state
    const wsClose = vi.fn();
    const wsSend = vi.fn();
    const originalReadyState = 3; // CLOSED

    // Create a mock WebSocket constructor directly
    const MockConstructor = vi.fn().mockImplementation(() => ({
      readyState: originalReadyState,
      send: wsSend,
      close: wsClose,
      on: vi.fn(),
    }));

    vi.spyOn(global as any, 'WebSocket').mockImplementation(MockConstructor);

    await client.connect();

    // This will internally call sendAck, but it should not trigger ws.send since readyState is not OPEN
    // Simulate receiving a valid message via handle
    const validMessageBuffer = Buffer.from(
      JSON.stringify({
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: '/v1.0/im/bot/messages/get',
          messageId: 'test-msg-123',
          time: '1713000000000',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'Hello' },
          sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
        }),
      })
    );

    const wsMock = {
      readyState: originalReadyState, // Closed state
      send: wsSend,
      close: wsClose,
      on: vi.fn((event, handler) => {
        if (event === 'message') {
          handler(validMessageBuffer); // This would normally trigger ACK sending
        }
        return this;
      }),
    };

    vi.spyOn(global, 'WebSocket').mockImplementation(() => wsMock);

    // Connect but ensure the WebSocket is still in closed state
    await client.connect();

    // Even though a message is processed, ACK should not be sent because WebSocket isn't open
    // This test is focused on the sendAck logic where readyState is not OPEN

    // Verify that send was not called, meaning ACK was properly skipped
    expect(wsSend).toHaveBeenCalledTimes(0); // ACK should not be sent when not OPEN
  });

  /**
   * @test REQ-002-8-08
   * @intent 验证当事件处理器引发错误时emit方法安全地捕获错误
   */
  it('should safely handle event handler errors within emit method', () => {
    const client = new DingTalkStreamClient(mockConfig);

    // Create a faulty handler that throws an error
    const faultyHandler = () => {
      throw new Error('Handler failed');
    };

    // Register the faulty handler
    client.on('test-event', faultyHandler);

    // Also add a good handler to make sure it still runs
    const goodHandler = vi.fn();
    client.on('test-event', goodHandler);

    // Spy on the logger to make sure errors in handlers are logged
    const errorLoggerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // This will trigger the emit function and one of our handlers will throw
    client['emit']('test-event', { data: 'test' });

    // The good handler should still be called
    expect(goodHandler).toHaveBeenCalledWith({ data: 'test' });

    // The error in the faulty handler should be caught and reported
    expect(errorLoggerSpy.mock.calls.length).toBeGreaterThan(0);
    // At least the first call should contain text mentioning "Event handler error"
    if (errorLoggerSpy.mock.calls.length > 0) {
      const firstCallArg = errorLoggerSpy.mock.calls[0][0];
      expect(firstCallArg).toContain('Event handler error');
    }

    errorLoggerSpy.mockRestore();
  });

  /**
   * @test REQ-002-8-01
   * @intent 验证WebSocket错误事件被正确传递给客户端
   */
  it('should handle WebSocket error events and emit them through the client', async () => {
    const client = new DingTalkStreamClient(mockConfig);

    const errorListener = vi.fn();
    client.on('error', errorListener);

    // Mock WebSocket with error event handling that should propagate to emit
    const wsError = new Error('Network error');
    let errorCallback: ((error: Error) => void) | null = null;
    let openCallback: (() => void) | null = null;

    vi.spyOn<any, any>(global, 'WebSocket').mockImplementation(() => ({
      readyState: 1, // OPEN
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'error') {
          errorCallback = callback as (error: Error) => void;
        } else if (event === 'open') {
          openCallback = callback as () => void;
        }
        return this;
      }),
    }));

    // Connect and verify error handling
    await client.connect();

    // Simulate the open event happening first
    if (openCallback) {
      openCallback();
    }

    // Now simulate an error event being triggered
    if (errorCallback) {
      errorCallback(wsError);
    }

    // Verify the error listener was called
    expect(errorListener).toHaveBeenCalledWith(wsError);
  });

  /**
   * @test REQ-002-8-05
   * @intent 验证sendAck函数在WebSocket未连接时不发生异常
   */
  it('should handle sendAck with null WebSocket gracefully', async () => {
    // Create a client and directly test the sendAck method when ws is null
    const client = new DingTalkStreamClient(mockConfig);

    // Simulate WebSocket instance after disconnect (would be null)
    client['ws'] = null;

    // This should not throw any exceptions - it should just return early
    expect(() => {
      client['sendAck']('test-message-id');
    }).not.toThrow();

    // Verify the function exits early without attempting to send (no crash)
    // We can verify the early return worked because we haven't setup any WebSocket
    expect(client['ws']).toBeNull();
  });
});
