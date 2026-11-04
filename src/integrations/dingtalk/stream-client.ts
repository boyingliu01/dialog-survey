import { WebSocket } from 'ws';
import type { StreamMessage } from '../../services/stream-message-utils.js';
import { debug, error, info } from '../../utils/logger.js';
import { dingTalkCredentialsFromEnv } from './client.js';

export interface DingTalkStreamConfig {
  clientId: string;
  clientSecret: string;
  robotCode?: string;
}

export interface ConnectionToken {
  endpoint: string;
  ticket: string;
}

/**
 * Wire envelope for a DingTalk Stream frame. Structurally identical to the
 * service-layer `StreamMessage`; aliased rather than redeclared so the two
 * layers cannot drift apart.
 */
export type DingTalkMessage = StreamMessage;

export interface AckResponse {
  code: number;
  headers: {
    messageId: string;
  };
  message: string;
  data: string;
}

export interface StreamClientOptions {
  maxReconnectAttempts?: number;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type EventHandler = (data: unknown) => void;

const CIRCUIT_COOLDOWN_MS = 30000;
const FAILURE_THRESHOLD = 3;

/** The batch-send endpoint for a 1:1 robot chat. */
const BATCH_SEND_URL = 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend';

/** The 1:1 send response body. */
interface BatchSendResponse {
  code?: string;
  message?: string;
  processQueryKey?: string;
  result?: { processQueryKey?: string };
}

/** POST one message to a user's 1:1 chat with the robot. */
async function postBatchSend(
  robotCode: string,
  userId: string,
  msgKey: string,
  msgParam: string,
  accessToken: string
): Promise<{ ok: boolean; status: number; data: BatchSendResponse }> {
  const response = await fetch(BATCH_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': accessToken,
    },
    body: JSON.stringify({ robotCode, userIds: [userId], msgKey, msgParam }),
  });
  return {
    ok: response.ok,
    status: response.status,
    data: (await response.json()) as BatchSendResponse,
  };
}

/**
 * True when the response reports a business-level error.
 *
 * The empty string counts as success because some responses send `code: ''`
 * rather than omitting the field.
 */
function isBusinessError(code: string | undefined): boolean {
  return code !== undefined && code !== '0' && code !== '';
}

/**
 * Why the send failed, or undefined when it succeeded.
 *
 * Both signals count: an HTTP failure, AND a 2xx carrying a non-zero `code`.
 * DingTalk answers 200 with a business error code often enough that checking
 * `response.ok` alone reports success for messages that were never delivered.
 */
function failureReason(ok: boolean, status: number, data: BatchSendResponse): string | undefined {
  if (ok && !isBusinessError(data.code)) return undefined;
  return data.message || `HTTP ${status}`;
}

/**
 * Call one event handler, containing any error it throws.
 *
 * One bad subscriber must not stop the others or unwind the socket callback that
 * dispatched the event, so the throw is logged and swallowed here rather than
 * left to the caller.
 */
function invokeHandler(event: string, handler: EventHandler, data: unknown): void {
  try {
    handler(data);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    error('Event handler error', { event, error: errMsg });
  }
}

/**
 * Open a Stream connection slot and return its endpoint and ticket.
 *
 * A non-2xx is turned into an error here rather than returned: the caller has no
 * meaningful fallback without an endpoint, and the status line is the only
 * diagnostic DingTalk gives for a bad app key.
 */
async function requestConnectionToken(config: DingTalkStreamConfig): Promise<ConnectionToken> {
  const response = await fetch('https://api.dingtalk.com/v1.0/gateway/connections/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      subscriptions: [{ topic: '/v1.0/im/bot/messages/get', type: 'CALLBACK' }],
      ua: 'bot',
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to get connection token: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as ConnectionToken;
}

export class DingTalkStreamClient {
  private config: DingTalkStreamConfig;
  private options: StreamClientOptions;
  private ws: WebSocket | null = null;
  private connected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private circuitState: CircuitState = 'CLOSED';
  private circuitOpenedAt: number | null = null;
  private failureCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private shuttingDown = false;
  private socketClosed: Promise<void> = Promise.resolve();
  private resolveSocketClosed: (() => void) | undefined;

  constructor(config: DingTalkStreamConfig, options: StreamClientOptions = {}) {
    if (!config.clientId) {
      throw new Error('clientId is required');
    }
    if (!config.clientSecret) {
      throw new Error('clientSecret is required');
    }

    this.config = config;
    this.options = {
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
    };
  }

  /**
   * Create client from environment variables
   */
  static fromEnv(): DingTalkStreamClient {
    // Reuse the shared resolver so Stream and REST accept the same spellings.
    // Reading `DINGTALK_CLIENT_ID` directly here meant a deployment configured
    // with `DINGTALK_APP_KEY`/`_SECRET` could send messages fine (REST fell
    // back) while the Stream socket silently never connected — the bot looked
    // correctly configured yet never received a single reply.
    const { appKey: clientId, appSecret: clientSecret } = dingTalkCredentialsFromEnv();
    const robotCode: string | undefined = process.env['DINGTALK_ROBOT_CODE'];

    return new DingTalkStreamClient({
      clientId,
      clientSecret,
      ...(robotCode != null ? { robotCode } : {}),
    });
  }

  /**
   * Get connection token from DingTalk API
   */
  async getConnectionToken(): Promise<ConnectionToken> {
    try {
      const data = await requestConnectionToken(this.config);
      if (!data.endpoint || !data.ticket) {
        throw new Error('endpoint or ticket missing in response');
      }
      debug('Got connection token', { endpoint: data.endpoint });
      return data;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      error('Failed to get connection token', { error: errMsg });
      throw err;
    }
  }

  /**
   * Build WebSocket URL from connection token
   */
  buildWebSocketUrl(token: ConnectionToken): string {
    return `${token.endpoint}?ticket=${encodeURIComponent(token.ticket)}`;
  }

  /**
   * Connect to DingTalk Stream
   */
  /**
   * True when a connect attempt must not start, logging why.
   *
   * Three separate reasons, and conflating them would hide a real bug: a shutdown
   * must not reconnect at all, an existing healthy socket makes a second attempt
   * a no-op, and a concurrent attempt would open a second socket whose close
   * handler fights the first one's circuit-breaker accounting.
   */
  private shouldSkipConnect(): boolean {
    if (this.shuttingDown) return true;
    if (this.connected && this.ws) {
      info('Already connected');
      return true;
    }
    if (this.isConnecting) {
      info('Connection already in progress, skipping');
      return true;
    }
    return false;
  }

  async connect(): Promise<void> {
    if (this.shouldSkipConnect()) return;
    this.isConnecting = true;
    const token = await this.getConnectionToken();
    if (this.shuttingDown) return;
    const wsUrl = this.buildWebSocketUrl(token);

    info('Connecting to DingTalk Stream', { endpoint: token.endpoint });

    this.ws = new WebSocket(wsUrl);
    this.socketClosed = new Promise<void>((resolve) => {
      this.resolveSocketClosed = resolve;
    });

    this.ws.on('open', () => {
      this.onSocketOpen();
    });
    this.ws.on('message', (data: Buffer) => {
      this.handleMessage(data);
    });
    this.ws.on('error', (err: Error) => {
      error('WebSocket error', { error: err.message });
      this.emit('error', err);
    });
    this.ws.on('close', (code: number, reason: Buffer) => {
      this.onSocketClose(code, reason);
    });
  }

  /** A socket that opened: the connection is healthy and the backoff resets. */
  private onSocketOpen(): void {
    this.connected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.failureCount = 0;
    info('Connected to DingTalk Stream');
    this.emit('connected', {});
  }

  /**
   * A socket closed: release the waiter, then decide whether to reconnect.
   *
   * Every close increments `failureCount`, including a clean one, because the
   * circuit breaker is about how often the link drops, not why. That ordering
   * makes two of the transitions below mutually exclusive: a trip to OPEN returns
   * immediately, so a socket that just opened the circuit does not ALSO schedule a
   * reconnect -- that would defeat the breaker entirely.
   */
  private onSocketClose(code: number, reason: Buffer): void {
    this.resolveSocketClosed?.();
    this.resolveSocketClosed = undefined;
    this.connected = false;
    this.isConnecting = false;
    this.failureCount++;

    const reasonText = reason.toString();
    info('WebSocket connection closed', {
      code,
      reason: reasonText,
      failureCount: this.failureCount,
    });
    this.emit('disconnected', { code, reason: reasonText });

    if (this.shuttingDown) return;
    if (this.tripCircuitIfNeeded()) return;

    const maxAttempts = this.options.maxReconnectAttempts ?? 3;
    if (this.reconnectAttempts < maxAttempts) this.reconnect();
  }

  /**
   * Open the circuit if the failure policy says so; returns whether it did.
   *
   * Two independent triggers. A CLOSED circuit trips once `failureCount` reaches
   * the threshold. A HALF_OPEN probe that fails trips immediately -- it exists to
   * test the water, so one failure is the answer, and the cooldown restarts.
   */
  private tripCircuitIfNeeded(): boolean {
    if (this.circuitState === 'CLOSED' && this.failureCount >= FAILURE_THRESHOLD) {
      this.circuitState = 'OPEN';
      this.circuitOpenedAt = Date.now();
      info('Circuit breaker OPEN', { cooldownMs: CIRCUIT_COOLDOWN_MS });
      return true;
    }
    if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'OPEN';
      this.circuitOpenedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    if (this.shuttingDown) return;
    try {
      const message = this.parseMessage(data.toString());
      info('Received message', {
        topic: message.headers.topic,
        messageId: message.headers.messageId,
      });

      this.emit('message', message);

      this.sendAck(message.headers.messageId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      error('Failed to handle message', { error: errMsg });
      this.emit('error', err);
    }
  }

  /**
   * Parse incoming message
   */
  parseMessage(data: string): DingTalkMessage {
    return JSON.parse(data) as DingTalkMessage;
  }

  /**
   * Build ACK response
   */
  buildAck(messageId: string): AckResponse {
    return {
      code: 200,
      headers: {
        messageId,
      },
      message: 'OK',
      data: '{}',
    };
  }

  /**
   * Send ACK response
   */
  private sendAck(messageId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const ack = this.buildAck(messageId);
    this.ws.send(JSON.stringify(ack));
    debug('Sent ACK', { messageId });
  }

  /**
   * Send text message via session webhook (reply in existing conversation)
   */
  async sendText(sessionWebhook: string, content: string): Promise<void> {
    if (!sessionWebhook) {
      throw new Error('sessionWebhook is required');
    }
    if (!content) {
      throw new Error('content is required');
    }

    const body = {
      msgtype: 'text',
      text: { content },
    };

    const response = await fetch(sessionWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
    }

    debug('Sent text message', {
      sessionWebhook,
      contentLength: content.length,
    });
  }

  /**
   * Send single chat message proactively via Robot API (需要 Robot.SingleChat.ReadWrite 权限)
   */
  async sendSingleChatText(
    userId: string,
    content: string,
    accessToken: string
  ): Promise<{
    success: boolean;
    processQueryKey?: string | undefined;
    error?: string | undefined;
  }> {
    return this.sendSingleChat(userId, 'sampleText', JSON.stringify({ content }), accessToken);
  }

  /**
   * Send single chat markdown message proactively via Robot API
   */
  async sendSingleChatMarkdown(
    userId: string,
    title: string,
    text: string,
    accessToken: string
  ): Promise<{
    success: boolean;
    processQueryKey?: string | undefined;
    error?: string | undefined;
  }> {
    return this.sendSingleChat(
      userId,
      'sampleMarkdown',
      JSON.stringify({ title, text }),
      accessToken
    );
  }

  private async sendSingleChat(
    userId: string,
    msgKey: string,
    msgParam: string,
    accessToken: string
  ): Promise<{
    success: boolean;
    processQueryKey?: string | undefined;
    error?: string | undefined;
  }> {
    const robotCode = this.config.robotCode;
    if (!robotCode) return { success: false, error: 'robotCode not configured' };

    const { ok, status, data } = await postBatchSend(
      robotCode,
      userId,
      msgKey,
      msgParam,
      accessToken
    );
    const failure = failureReason(ok, status, data);
    if (failure) {
      error('Single chat send failed', { userId, code: data.code, message: data.message });
      return { success: false, error: failure };
    }

    // The key arrives at the top level in most responses and nested under
    // `result` in others; either is the same handle for polling the send.
    const processQueryKey = data.processQueryKey || data.result?.processQueryKey || undefined;
    debug('Single chat message sent', { userId, processQueryKey });
    return { success: true, processQueryKey };
  }

  /**
   * Reconnect to DingTalk Stream
   */
  reconnect(): void {
    if (this.shuttingDown) return;
    if (this.circuitState === 'OPEN' && this.circuitOpenedAt) {
      const elapsed = Date.now() - this.circuitOpenedAt;
      if (elapsed < CIRCUIT_COOLDOWN_MS) {
        debug('Circuit open, skipping reconnect', { remainingMs: CIRCUIT_COOLDOWN_MS - elapsed });
        return;
      }
      this.circuitState = 'HALF_OPEN';
      this.failureCount = 0;
    }

    this.reconnectAttempts++;
    info('Reconnecting', { attempt: this.reconnectAttempts });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch((err) => {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        error('Reconnection failed', { error: errMsg });
      });
    }, 1000 * this.reconnectAttempts);
  }

  /**
   * Disconnect from DingTalk Stream
   */
  async disconnect(): Promise<void> {
    this.shuttingDown = true;
    this.isConnecting = false;
    this.eventHandlers.delete('message');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (!this.ws) return;
    this.connected = false;
    this.reconnectAttempts = 0;
    await this.closeSocket();
    this.ws = null;
    info('Disconnected from DingTalk Stream');
  }

  /**
   * Close the socket and wait for the close to land.
   *
   * A socket still CONNECTING cannot be closed before the handshake finishes, so
   * it is left to finish and then awaited: dropping the reference early would let
   * the caller start a new connection while this one was still open.
   */
  private async closeSocket(): Promise<void> {
    const socket = this.ws;
    if (!socket) return;
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    if (socket.readyState !== WebSocket.CLOSED) await this.socketClosed;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get current reconnect attempts
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Get max reconnect attempts
   */
  getMaxReconnectAttempts(): number {
    return this.options.maxReconnectAttempts ?? 3;
  }

  /**
   * Register event handler
   */
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    const handlersForEvent = this.eventHandlers.get(event);
    if (handlersForEvent) {
      handlersForEvent.push(handler);
    }
  }

  /**
   * Unregister event handler
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    if (this.shuttingDown) return;
    for (const handler of this.eventHandlers.get(event) ?? []) {
      invokeHandler(event, handler, data);
    }
  }
}
