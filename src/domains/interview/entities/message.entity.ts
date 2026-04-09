export interface MessageEntity {
  id: string;
  interviewId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageId?: string;
  isVoice: boolean;
  createdAt: Date;
}

export function createMessage(params: {
  interviewId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}): MessageEntity {
  return {
    id: crypto.randomUUID(),
    interviewId: params.interviewId,
    role: params.role,
    content: params.content,
    isVoice: false,
    createdAt: new Date(),
  };
}
