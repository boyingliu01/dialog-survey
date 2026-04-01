import WebSocket from "ws";
import crypto from "crypto";
import { CallbackMessage } from "../dingtalk.js";
import { StreamConfig, StreamEvent, StreamEventListener } from "./types.js";
import logger from "../../utils/logger.js";

class DingTalkStreamHandler {
  private config: StreamConfig;
  private ws: WebSocket | null = null;
  private _isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private messageCache: Map<string, number> = new Map();
  private eventListeners: StreamEventListener[] = [];

  constructor(config: StreamConfig) {
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: Infinity,
      messageCacheSize: 1000,
      messageCacheTTL: 60000,
      ...config,
    };
  }

  /**
   * Check if the stream is connected
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Add event listener
   */
  on(listener: StreamEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  off(listener: StreamEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: StreamEvent, data?: unknown): void {
    this.eventListeners.forEach((listener) => listener(event, data));
  }

  /**
   * Generate signature for Stream API connection
   */
  private generateSignature(timestamp: number, nonce: string): string {
    const data = [this.config.appSecret, timestamp.toString(), nonce]
      .sort()
      .join("");
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Connect to DingTalk Stream API
   */
  async connect(): Promise<void> {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 15);
    const signature = this.generateSignature(timestamp, nonce);

    const url = new URL("wss://aiserver.dingtalk.com/chatbot/stream");
    url.searchParams.set("appKey", this.config.appKey);
    url.searchParams.set("timestamp", timestamp.toString());
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("signature", signature);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url.toString());

      this.ws.on("open", () => {
        this._isConnected = true;
        this.reconnectAttempts = 0;
        logger.info("Connected to DingTalk Stream API");
        this.emit("connect");
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data);
      });

      this.ws.on("close", (code, reason) => {
        this._isConnected = false;
        logger.info(
          `Disconnected from DingTalk Stream API: ${code} - ${reason.toString()}`,
        );
        this.emit("disconnect", { code, reason });

        const maxAttempts = this.config.maxReconnectAttempts ?? Infinity;
        if (this.reconnectAttempts < maxAttempts) {
          this.reconnect();
        }
      });

      this.ws.on("error", (error) => {
        logger.error({ error }, "Stream connection error");
        this.emit("error", error);
        reject(error);
      });
    });
  }

  /**
   * Reconnect to DingTalk Stream API
   */
  private reconnect(): void {
    this.reconnectAttempts++;
    logger.info(`Reconnecting attempt ${this.reconnectAttempts}...`);

    this.emit("reconnect", {
      attempt: this.reconnectAttempts,
      interval: this.config.reconnectInterval,
    });

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error({ error }, "Reconnect failed");
      });
    }, this.config.reconnectInterval);
  }

  /**
   * Disconnect from Stream API
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }

  /**
   * Check if message is duplicate using LRU cache with TTL
   */
  private isDuplicateMessage(msgId: string): boolean {
    const now = Date.now();
    const cacheTTL = this.config.messageCacheTTL ?? 60000;
    const cacheSize = this.config.messageCacheSize ?? 1000;

    // Clean up expired cache entries
    for (const [key, timestamp] of this.messageCache.entries()) {
      if (now - timestamp > cacheTTL) {
        this.messageCache.delete(key);
      }
    }

    if (this.messageCache.has(msgId)) {
      return true;
    }

    // Limit cache size
    if (this.messageCache.size >= cacheSize) {
      const oldestKey = Array.from(this.messageCache.entries()).sort(
        (a, b) => a[1] - b[1],
      )[0][0];
      this.messageCache.delete(oldestKey);
    }

    this.messageCache.set(msgId, now);
    return false;
  }

  /**
   * Handle incoming messages from Stream API
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const messageStr = Buffer.isBuffer(data)
        ? data.toString("utf-8")
        : data instanceof ArrayBuffer
          ? Buffer.from(data).toString("utf-8")
          : Array.isArray(data)
            ? Buffer.concat(data).toString("utf-8")
            : String(data);
      const message: CallbackMessage = JSON.parse(
        messageStr,
      ) as CallbackMessage;

      // Check for duplicate messages
      if (this.isDuplicateMessage(message.msgId)) {
        logger.debug(`Duplicate message received: ${message.msgId}`);
        return;
      }

      logger.info({ message }, "Received message from DingTalk Stream");
      this.emit("message", message);
    } catch (error) {
      logger.error({ error }, "Failed to parse Stream message");
      this.emit("error", error);
    }
  }
}

export { DingTalkStreamHandler };
