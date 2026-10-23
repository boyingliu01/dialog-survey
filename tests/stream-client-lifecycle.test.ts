import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

/**
 * @test REQ-155-STREAM-LIFECYCLE
 * @intent 覆盖 Stream 客户端的熔断器、重连退避与连接守卫，这些分支决定故障时系统能否自愈
 * @covers connect 的三重守卫、关闭回调的熔断升级（CLOSED→OPEN、HALF_OPEN→OPEN）、重连的指数退避与冷却窗口、shuttingDown 短路
 *
 * Gate M had stream-client.ts at 53.5% with 66 mutants never executed. The
 * untested part was not the happy path but the recovery machinery: the circuit
 * breaker, the backoff and the "already connected" guards. Those run exactly
 * when something is wrong, so a regression there stays invisible until
 * production is already degraded.
 */

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeWebSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 0;
    sent: string[] = [];
    send(data: string): void {
      this.sent.push(data);
    }
    close(): void {
      this.readyState = 3;
      this.emit('close', 1000, Buffer.from(''));
    }
    terminate(): void {
      this.readyState = 3;
      this.emit('close', 1006, Buffer.from(''));
    }
  }
  return { WebSocket: FakeWebSocket };
});

const mockInfo = vi.fn();
const mockDebug = vi.fn();
const mockError = vi.fn();

vi.mock('../src/utils/logger.js', () => ({
  info: (...a: unknown[]) => mockInfo(...a),
  debug: (...a: unknown[]) => mockDebug(...a),
  error: (...a: unknown[]) => mockError(...a),
  warn: vi.fn(),
}));

const { DingTalkStreamClient } = await import('../src/integrations/dingtalk/stream-client.js');

const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

const config = { clientId: 'key', clientSecret: 'secret' };

interface Internals {
  circuitState: string;
  circuitOpenedAt: number | undefined;
  failureCount: number;
  reconnectAttempts: number;
  connected: boolean;
  isConnecting: boolean;
  shuttingDown: boolean;
  ws: InstanceType<typeof WebSocket> | null | undefined;
}

function internals(client: InstanceType<typeof DingTalkStreamClient>): Internals {
  return client as unknown as Internals;
}

/** Give the client a live socket whose close we can fire by hand. */
async function connectWithFakeSocket(
  client: InstanceType<typeof DingTalkStreamClient>
): Promise<InstanceType<typeof WebSocket>> {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ endpoint: 'wss://stream.example', ticket: 'ticket-1' }),
  });
  await client.connect();
  const ws = internals(client).ws;
  if (!ws) throw new Error('connect() did not create a socket');
  ws.emit('open');
  return ws;
}

describe('DingTalkStreamClient lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('connect guards', () => {
    it('skips when the socket is already open', async () => {
      const client = new DingTalkStreamClient(config);
      await connectWithFakeSocket(client);

      await client.connect();

      expect(mockInfo).toHaveBeenCalledWith('Already connected');
    });

    it('skips when a connection attempt is already in flight', async () => {
      const client = new DingTalkStreamClient(config);
      internals(client).isConnecting = true;

      await client.connect();

      expect(mockInfo).toHaveBeenCalledWith('Connection already in progress, skipping');
    });

    it('does nothing after shutdown', async () => {
      const client = new DingTalkStreamClient(config);
      internals(client).shuttingDown = true;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ endpoint: 'wss://x', ticket: 't' }),
      });
      global.fetch = fetchMock;

      await client.connect();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(internals(client).ws).toBeFalsy();
    });
  });

  describe('circuit breaker', () => {
    it('opens after the failure threshold is reached', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        ws.emit('close', 1006, Buffer.from('boom'));
      }

      expect(internals(client).circuitState).toBe('OPEN');
      expect(internals(client).circuitOpenedAt).toBeTypeOf('number');
      expect(mockInfo).toHaveBeenCalledWith(
        'Circuit breaker OPEN',
        expect.objectContaining({ cooldownMs: CIRCUIT_COOLDOWN_MS })
      );
    });

    it('stops scheduling reconnects once open', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        ws.emit('close', 1006, Buffer.from('boom'));
      }
      const attemptsAtOpen = internals(client).reconnectAttempts;

      vi.advanceTimersByTime(60_000);

      expect(internals(client).reconnectAttempts).toBe(attemptsAtOpen);
    });

    it('reaches HALF_OPEN after the cooldown and reopens on the next failure', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        ws.emit('close', 1006, Buffer.from('boom'));
      }
      const openedAt = internals(client).circuitOpenedAt;
      if (openedAt === undefined) throw new Error('circuit never opened');

      // Wait out the cooldown, then attempt a reconnect.
      vi.setSystemTime(openedAt + CIRCUIT_COOLDOWN_MS + 1);
      client.reconnect();
      expect(internals(client).circuitState).toBe('HALF_OPEN');
      expect(internals(client).failureCount).toBe(0);

      // A failure while HALF_OPEN reopens the circuit immediately.
      await vi.advanceTimersByTimeAsync(1000);
      const fresh = internals(client).ws;
      if (!fresh) throw new Error('no socket after reconnect');
      fresh.emit('close', 1006, Buffer.from('still bad'));

      expect(internals(client).circuitState).toBe('OPEN');
    });

    it('keeps the circuit OPEN while the cooldown is still running', async () => {
      const client = new DingTalkStreamClient(config);
      await connectWithFakeSocket(client);
      const inner = internals(client);
      inner.circuitState = 'OPEN';
      inner.circuitOpenedAt = Date.now();
      const attemptsBefore = inner.reconnectAttempts;

      client.reconnect();

      expect(mockDebug).toHaveBeenCalledWith(
        'Circuit open, skipping reconnect',
        expect.objectContaining({ remainingMs: expect.any(Number) })
      );
      expect(inner.reconnectAttempts).toBe(attemptsBefore);
    });
  });

  describe('reconnect backoff', () => {
    it('schedules with a delay proportional to the attempt count', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);
      const fetchCallsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      ws.emit('close', 1006, Buffer.from('bye'));
      expect(internals(client).reconnectAttempts).toBe(1);

      // Not yet: the first retry waits 1s.
      await vi.advanceTimersByTimeAsync(500);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBefore);

      await vi.advanceTimersByTimeAsync(600);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        fetchCallsBefore
      );
    });

    it('logs the attempt number', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);

      ws.emit('close', 1006, Buffer.from('bye'));

      expect(mockInfo).toHaveBeenCalledWith('Reconnecting', { attempt: 1 });
    });

    it('stops retrying past maxReconnectAttempts', async () => {
      const client = new DingTalkStreamClient(config, { maxReconnectAttempts: 1 });
      const ws = await connectWithFakeSocket(client);

      ws.emit('close', 1006, Buffer.from('bye'));
      expect(internals(client).reconnectAttempts).toBe(1);

      // The retry itself fails to reconnect, and no second one is scheduled.
      global.fetch = vi.fn().mockRejectedValue(new Error('still down'));
      await vi.advanceTimersByTimeAsync(10_000);

      expect(internals(client).reconnectAttempts).toBe(1);
    });

    it('logs without throwing when a scheduled reconnect fails', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);
      ws.emit('close', 1006, Buffer.from('bye'));

      global.fetch = vi.fn().mockRejectedValue(new Error('gateway down'));
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockError).toHaveBeenCalledWith(
        'Reconnection failed',
        expect.objectContaining({ error: 'gateway down' })
      );
    });
  });

  describe('shutdown', () => {
    it('does not reconnect after disconnect', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);

      await client.disconnect();
      const attemptsBefore = internals(client).reconnectAttempts;
      ws.emit('close', 1000, Buffer.from(''));

      expect(internals(client).reconnectAttempts).toBe(attemptsBefore);
      expect(internals(client).shuttingDown).toBe(true);
    });

    it('resets the connecting flag', async () => {
      const client = new DingTalkStreamClient(config);
      await connectWithFakeSocket(client);
      internals(client).isConnecting = true;

      await client.disconnect();

      expect(internals(client).isConnecting).toBe(false);
    });
  });

  describe('disconnected event', () => {
    it('emits code and reason', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);
      const seen: Array<{ code: number; reason: string }> = [];
      client.on('disconnected', (payload) => {
        seen.push(payload as { code: number; reason: string });
      });

      ws.emit('close', 1001, Buffer.from('going away'));

      expect(seen).toEqual([{ code: 1001, reason: 'going away' }]);
    });

    it('marks the client disconnected and logs the failure count', async () => {
      const client = new DingTalkStreamClient(config);
      const ws = await connectWithFakeSocket(client);

      ws.emit('close', 1006, Buffer.from('boom'));

      expect(internals(client).connected).toBe(false);
      expect(mockInfo).toHaveBeenCalledWith(
        'WebSocket connection closed',
        expect.objectContaining({ code: 1006, reason: 'boom', failureCount: 1 })
      );
    });
  });
});
