import { z } from 'zod';

// DingTalk message schema validation
export const DingTalkMessageSchema = z.object({
  msgtype: z.string(),
  text: z.object({
    content: z.string(),
  }).optional(),
  image: z.object({
    media_id: z.string(),
  }).optional(),
  voice: z.object({
    media_id: z.string(),
    duration: z.number(),
  }).optional(),
  file: z.object({
    media_id: z.string(),
  }).optional(),
  location: z.object({
    title: z.string(),
    address: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  link: z.object({
    title: z.string(),
    text: z.string(),
    message_url: z.string(),
    pic_url: z.string().optional(),
  }).optional(),
  markdown: z.object({
    title: z.string(),
    text: z.string(),
  }).optional(),
});

// DingTalk message type
export type DingTalkMessage = z.infer<typeof DingTalkMessageSchema>;

// DingTalk configuration interface
export interface DingTalkConfig {
  appKey: string;
  appSecret: string;
  agentId: string;
  token?: string;
  aesKey?: string;
}

// Send message request interface
export interface SendMessageRequest {
  userid?: string;
  unionid?: string;
  openConversationId?: string;
  conversationId?: string;
  msg: DingTalkMessage;
}

// Callback message interface for Stream API
export interface CallbackMessage {
  msgId: string;
  createAt: number;
  senderStaffId: string;
  conversationId: string;
  conversationType: '1' | '2' | '3';
  senderCorpId: string;
  conversationTitle: string;
  msgtype: string;
  text?: { content: string };
  image?: { media_id: string };
  voice?: { media_id: string; duration: number };
  file?: { media_id: string };
  location?: { title: string; address: string; latitude: number; longitude: number };
  link?: { title: string; text: string; message_url: string; pic_url?: string };
  markdown?: { title: string; text: string };
}
