import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';

let lastMockInstance: any = null;
let currentReadyState = 1;

vi.mock('ws', () => {
  const mockSend = vi.fn();
  const mockClose = vi.fn();
  const callbacks = new Map<string, (...args: any[]) => void>();

  class MockWs {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;
    send = mockSend;
    close = mockClose;
    on = vi.fn((event: string, cb: (...args: any[]) => void) => {
      callbacks.set(event, cb);
    });
    _callbacks = callbacks;
    constructor(_url: string) {
      lastMockInstance = this;
    }
  }
  return { WebSocket: MockWs as unknown, default: {} };
});

import { DingTalkStreamClient } from '../src/integrations/dingtalk/stream-client.js';

interface WsMock {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _callbacks: Map<string, (...args: any[]) => void>;
  _trigger: (event: string, ...args: any[]) => void;
}

function getWsMock(): WsMock {
  return lastMockInstance as WsMock;
}

beforeEach(() => {
  lastMockInstance = null;
  currentReadyState = 1;
});

describe('DingTalkStreamClient Branch Coverage', () => {
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    agentId: 'test-agent-id',
  };

  const mockConnectionResponse = { endpoint: 'wss://test.com', ticket: 'test-ticket' };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConnectionResponse),
      })
    ) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should emit error when handleMessage cannot parse incoming message', async () => {
    const client = new DingTalkStreamClient(mockConfig);
    const errorHandler = vi.fn();
    client.on('error', errorHandler);
    const spyParse = vi.spyOn(client, 'parseMessage').mockImplementation(() => {
      throw new Error('Invalid JSON');
    });

    await client.connect();

    const wsMock = getWsMock();
    expect(wsMock).toBeTruthy();
    const msgCb = wsMock._callbacks.get('message');
    if (msgCb) msgCb('invalid json text');

    await new Promise((r) => setTimeout(r, 50));
    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    spyParse.mockRestore();
  });

  it('should not send ACK when WebSocket readyState is not OPEN', async () => {
    const client = new DingTalkStreamClient(mockConfig);
    await client.connect();

    const wsMock = getWsMock();
    expect(wsMock).toBeTruthy();

    currentReadyState = 3;

    const openCb = wsMock._callbacks.get('open');
    if (openCb) openCb();

    const validMsg = JSON.stringify({
      specVersion: '1.0',
      type: 'CALLBACK',
      headers: {
        topic: '/v1.0/im/bot/messages/get',
        messageId: 'test-msg-123',
        time: '1713000000000',
      },
      data: JSON.stringify({ senderStaffId: 'user-123', text: { content: 'Hello' } }),
    });

    const msgCb = wsMock._callbacks.get('message');
    if (msgCb) msgCb(Buffer.from(validMsg));

    await new Promise((r) => setTimeout(r, 50));
    expect(wsMock.send).toHaveBeenCalledTimes(0);
  });

  it('should safely handle event handler errors within emit method', () => {
    const client = new DingTalkStreamClient(mockConfig);
    const faultyHandler = () => {
      throw new Error('Handler failed');
    };
    client.on('test-event', faultyHandler);
    const goodHandler = vi.fn();
    client.on('test-event', goodHandler);

    (client as any).emit('test-event', { data: 'test' });

    expect(goodHandler).toHaveBeenCalledWith({ data: 'test' });
  });

  it('should handle WebSocket error events and emit them through the client', async () => {
    const client = new DingTalkStreamClient(mockConfig);
    const errorListener = vi.fn();
    client.on('error', errorListener);

    await client.connect();

    const wsMock = getWsMock();
    expect(wsMock).toBeTruthy();

    const errCb = wsMock._callbacks.get('error');
    if (errCb) errCb(new Error('Network error'));

    await new Promise((r) => setTimeout(r, 10));
    expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should handle sendAck with null WebSocket gracefully', async () => {
    const client = new DingTalkStreamClient(mockConfig);
    (client as any).ws = null;
    expect(() => {
      (client as any).sendAck('test-message-id');
    }).not.toThrow();
    expect((client as any).ws).toBeNull();
  });
});
