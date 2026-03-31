// Stream connection configuration
export interface StreamConfig {
  appKey: string;
  appSecret: string;
  agentId: string;
  token?: string;
  aesKey?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  messageCacheSize?: number;
  messageCacheTTL?: number;
}

// Stream handler events
export type StreamEvent = 'connect' | 'disconnect' | 'message' | 'error' | 'reconnect';

// Event listener type
export type StreamEventListener = (event: StreamEvent, data?: unknown) => void;
