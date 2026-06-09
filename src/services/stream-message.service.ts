import { PrismaClient } from '@prisma/client';
import { runInterviewGraph } from '../core/graph.js';
import type { GraphResult } from '../core/graph.js';
import type { InterviewState } from '../core/types/index.js';
import { InterviewStateRepository } from '../repositories/interview-state.repository.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { getDb } from '../utils/db.js';
import { error, info } from '../utils/logger.js';

export interface StreamMessage {
  specVersion: string;
  type: string;
  headers: {
    topic: string;
    messageId: string;
    time: string;
  };
  data: string;
}

export interface ParsedStreamMessage {
  userId: string;
  content: string;
  sessionWebhook: string;
  messageId: string;
}

export interface ProcessResult {
  success: boolean;
  response?: string;
  error?: string;
}

const MAX_RETRIES = 3;

export class StreamMessageService {
  private repo: InterviewStateRepository;

  constructor(repo?: InterviewStateRepository) {
    this.repo = repo || new InterviewStateRepository(getDb());
  }

  parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
    try {
      info('Parsing stream message', {
        dataLength: message.data?.length,
        hasData: !!message.data,
      });

      const data = JSON.parse(message.data);

      info('Parsed outer data', {
        hasSenderStaffId: !!data.senderStaffId,
        hasText: !!data.text,
        hasContent: !!data.content,
        hasSessionWebhook: !!data.sessionWebhook,
        msgtype: data.msgtype,
      });

      const content = data.text?.content || data.content || '';

      info('Extracted content', {
        contentLength: content?.length,
        contentPreview: content?.substring(0, 50),
      });

      return {
        userId: data.senderStaffId || '',
        content: content,
        sessionWebhook: data.sessionWebhook || '',
        messageId: message.headers.messageId,
      };
    } catch (e) {
      error('Failed to parse stream message', {
        error: e instanceof Error ? e.message : String(e),
        rawData: message.data?.substring(0, 500),
      });
      return null;
    }
  }

  /** Allowed DingTalk hostnames for SSRF protection */
  private static readonly ALLOWED_WEBHOOK_HOSTS = new Set([
    'oapi.dingtalk.com',
    'api.dingtalk.com',
    'router.dingtalk.com',
  ]);

  /**
   * Validates that a webhook URL is from an allowed DingTalk hostname.
   * Protects against SSRF attacks via malicious URLs (e.g., file:///, http://169.254169.254/, etc.)
   */
  private static isAllowedWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return StreamMessageService.ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  }

  async sendReply(sessionWebhook: string, content: string): Promise<boolean> {
    if (!sessionWebhook) {
      error('No sessionWebhook provided');
      return false;
    }

    if (!StreamMessageService.isAllowedWebhookUrl(sessionWebhook)) {
      error('Webhook URL hostname not in allowlist', { url: sessionWebhook });
      return false;
    }

    info('Sending reply', {
      webhook: sessionWebhook,
      contentLength: content.length,
      contentPreview: content.substring(0, 50),
    });

    try {
      const body = {
        msgtype: 'text',
        text: { content },
      };

      const response = await fetch(sessionWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      info('Reply response', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const responseText = await response.text();
        error('Failed to send reply', {
          status: response.status,
          statusText: response.statusText,
          webhook: sessionWebhook,
          responseText: responseText.substring(0, 200),
        });
        return false;
      }

      info('Reply sent successfully', {
        webhook: sessionWebhook,
        contentLength: content.length,
      });
      return true;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      error('Failed to send reply', { error: errMsg });
      return false;
    }
  }

  async processStreamMessage(message: StreamMessage, retryCount = 0): Promise<ProcessResult> {
    const parsed = this.parseStreamMessage(message);

    if (!parsed) {
      error('Message parse failed - invalid format', {
        data: message.data?.substring(0, 200),
      });
      return { success: false, error: 'Invalid message format' };
    }

    if (!parsed.userId || !parsed.content) {
      error('Message missing required fields', {
        userId: parsed.userId,
        content: parsed.content?.substring(0, 100),
      });
      return { success: false, error: 'Missing userId or content' };
    }

    info('Processing stream message', {
      userId: parsed.userId,
      content: parsed.content,
      messageId: parsed.messageId,
    });

    let state = await this.repo.findActiveInterview(parsed.userId);

    if (!state) {
      const templateId = await this.resolveDefaultTemplateId();
      const interviewId = await this.repo.createInterview(parsed.userId, templateId);
      state = {
        userId: parsed.userId,
        interviewId,
        templateId,
        status: 'PENDING',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };
    }

    state.pendingMessages.push({
      role: 'user',
      content: parsed.content,
      isVoice: false,
    });

    // Resolve userName for personalization if not already in state
    if (!state.userName) {
      try {
        const prisma = getDb();
        const interview = await prisma.interview.findFirst({
          where: { userId: parsed.userId },
          select: { planId: true },
        });
        if (interview?.planId) {
          const plan = await prisma.interviewPlan.findUnique({
            where: { id: interview.planId },
            select: { inviteeData: true },
          });
          if (plan?.inviteeData) {
            const invitees = plan.inviteeData as { userId: string; name?: string }[];
            const matched = invitees.find((inv) => inv.userId === parsed.userId);
            if (matched?.name) state.userName = matched.name;
          }
        }
      } catch {
        // Silently fail userName resolution
      }
    }

    const graphResult: GraphResult = await runInterviewGraph(state, {
      userId: parsed.userId,
      content: parsed.content,
      isVoice: false,
    });

    const nextState = graphResult.nextState;
    // Persist only newly added responses to the Response table (diff against what was loaded from DB)
    const existingCount = state.responses.length;
    const newResponses = nextState.responses.slice(existingCount);
    if (newResponses.length > 0) {
      nextState.pendingResponses = newResponses;
    }
    nextState.pendingMessages.push({
      role: 'assistant',
      content: graphResult.response,
      isVoice: false,
    });

    try {
      await this.repo.saveFullState(state.interviewId as string, nextState);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      if (errorMsg.includes('Version conflict') && retryCount < MAX_RETRIES) {
        info('Retrying due to version conflict', {
          userId: parsed.userId,
          retryCount: retryCount + 1,
        });
        const freshState = await this.repo.loadFullState(
          state.interviewId as string,
          parsed.userId
        );
        if (freshState) {
          freshState.pendingMessages = [{ role: 'user', content: parsed.content, isVoice: false }];
          const retryGraphResult = await runInterviewGraph(freshState, {
            userId: parsed.userId,
            content: parsed.content,
            isVoice: false,
          });
          const retryExistingCount = freshState.responses.length;
          const retryNewResponses = retryGraphResult.nextState.responses.slice(retryExistingCount);
          if (retryNewResponses.length > 0) {
            retryGraphResult.nextState.pendingResponses = retryNewResponses;
          }
          retryGraphResult.nextState.pendingMessages.push({
            role: 'assistant',
            content: retryGraphResult.response,
            isVoice: false,
          });
          return this.processStreamMessageWithState(
            message,
            retryGraphResult,
            freshState,
            retryCount + 1
          );
        }
      }
      return { success: false, error: errorMsg };
    }

    if (parsed.sessionWebhook) {
      await this.sendReply(parsed.sessionWebhook, graphResult.response);
    }

    return { success: true, response: graphResult.response };
  }

  private async processStreamMessageWithState(
    message: StreamMessage,
    graphResult: GraphResult,
    state: InterviewState,
    retryCount: number
  ): Promise<ProcessResult> {
    const parsed = this.parseStreamMessage(message);
    if (!parsed) {
      return { success: false, error: 'Invalid message format' };
    }

    try {
      const existingCount = state.responses.length;
      const newResponses = graphResult.nextState.responses.slice(existingCount);
      if (newResponses.length > 0) {
        graphResult.nextState.pendingResponses = newResponses;
      }
      await this.repo.saveFullState(state.interviewId as string, graphResult.nextState);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      if (errorMsg.includes('Version conflict') && retryCount < MAX_RETRIES) {
        return this.processStreamMessage(message, retryCount + 1);
      }
      return { success: false, error: errorMsg };
    }

    if (parsed.sessionWebhook) {
      await this.sendReply(parsed.sessionWebhook, graphResult.response);
    }

    return { success: true, response: graphResult.response };
  }

  private async resolveDefaultTemplateId(): Promise<string> {
    const repo = new TemplateRepository(getDb());
    const templates = await repo.findAll();
    const published = templates.find((t) => t.status === 'PUBLISHED');
    if (published) return published.id;
    return templates.length > 0 ? templates[0].id : 'test-template';
  }
}

export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  try {
    const data = JSON.parse(message.data);
    const content = data.text?.content || data.content || '';

    return {
      userId: data.senderStaffId || '',
      content: content,
      sessionWebhook: data.sessionWebhook || '',
      messageId: message.headers.messageId,
    };
  } catch (e) {
    error('Failed to parse stream message', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function sendReply(sessionWebhook: string, content: string): Promise<boolean> {
  if (!sessionWebhook) {
    error('No sessionWebhook provided');
    return false;
  }

  info('Sending reply (exported)', {
    webhook: sessionWebhook,
    contentLength: content.length,
  });

  try {
    const body = {
      msgtype: 'text',
      text: { content },
    };

    const response = await fetch(sessionWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseText = await response.text();
      error('Failed to send reply', {
        status: response.status,
        statusText: response.statusText,
        webhook: sessionWebhook,
        responseText: responseText.substring(0, 200),
      });
      return false;
    }

    info('Reply sent', {
      webhook: sessionWebhook,
      contentLength: content.length,
    });
    return true;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    error('Failed to send reply', { error: errMsg });
    return false;
  }
}

export async function processStreamMessage(
  message: StreamMessage,
  prisma?: PrismaClient
): Promise<ProcessResult> {
  const repo = new InterviewStateRepository(prisma ?? getDb());
  const service = new StreamMessageService(repo);
  return service.processStreamMessage(message);
}
