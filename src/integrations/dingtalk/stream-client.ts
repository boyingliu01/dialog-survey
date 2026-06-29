import { WebSocket } from 'ws';
import { debug, error, info } from '../../utils/logger.js';

export interface DingTalkStreamConfig {
  clientId: string;
  clientSecret: string;
  agentId?: string;
}

export interface ConnectionToken {
  endpoint: string;
  ticket: string;
}

export interface DingTalkMessage {
  specVersion: string;
  type: string;
  headers: {
    topic: string;
    messageId: string;
    time: string;
  };
  data: string;
}

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
    const clientId = process.env['DINGTALK_CLIENT_ID'] || '';
    const clientSecret = process.env['DINGTALK_CLIENT_SECRET'] || '';
    const agentId: string | undefined = process.env['DINGTALK_AGENT_ID'];

    return new DingTalkStreamClient({
      clientId,
      clientSecret,
      ...(agentId != null ? { agentId } : {}),
    });
  }

  /**
   * Get connection token from DingTalk API
   */
  async getConnectionToken(): Promise<ConnectionToken> {
    const url = 'https://api.dingtalk.com/v1.0/gateway/connections/open';
    const body = {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      subscriptions: [
        {
          topic: '/v1.0/im/bot/messages/get',
          type: 'CALLBACK',
        },
      ],
      ua: 'bot',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get connection token: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as ConnectionToken;

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
  async connect(): Promise<void> {
    if (this.connected && this.ws) {
      info('Already connected');
      return;
    }

    if (this.isConnecting) {
      info('Connection already in progress, skipping');
      return;
    }
    this.isConnecting = true;
    const token = await this.getConnectionToken();
    const wsUrl = this.buildWebSocketUrl(token);

    info('Connecting to DingTalk Stream', { endpoint: token.endpoint });

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.connected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.failureCount = 0;
      info('Connected to DingTalk Stream');
      this.emit('connected', {});
    });

    this.ws.on('message', (data: Buffer) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      error('WebSocket error', { error: err.message });
      this.emit('error', err);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.connected = false;
      this.isConnecting = false;
      this.failureCount++;
      info('WebSocket connection closed', {
        code,
        reason: reason.toString(),
        failureCount: this.failureCount,
      });
      this.emit('disconnected', { code, reason: reason.toString() });

      if (this.circuitState === 'CLOSED' && this.failureCount >= FAILURE_THRESHOLD) {
        this.circuitState = 'OPEN';
        this.circuitOpenedAt = Date.now();
        info('Circuit breaker OPEN', { cooldownMs: CIRCUIT_COOLDOWN_MS });
        return;
      }

      if (this.circuitState === 'HALF_OPEN') {
        this.circuitState = 'OPEN';
        this.circuitOpenedAt = Date.now();
        return;
      }

      const maxAttempts = this.options.maxReconnectAttempts ?? 3;
      if (this.reconnectAttempts < maxAttempts) {
        this.reconnect();
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
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
   * Send text message via session webhook
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
   * Reconnect to DingTalk Stream
   */
  reconnect(): void {
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

    setTimeout(() => {
      this.connect().catch((err) => {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        error('Reconnection failed', { error: errMsg });
      });
    }, 1000 * this.reconnectAttempts);
  }

  /**
   * Disconnect from DingTalk Stream
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.reconnectAttempts = 0;
      info('Disconnected from DingTalk Stream');
    }
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
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          error('Event handler error', { event, error: errMsg });
        }
      }
    }
  }
}
