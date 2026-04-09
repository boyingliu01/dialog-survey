import { error, info } from '../utils/logger.js';

const ASR_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';

interface ASRResult {
  text: string;
  success: boolean;
  error?: string;
}

export async function transcribeAudio(audioUrl: string): Promise<ASRResult> {
  const apiKey = process.env.FUN_ASR_API_KEY;

  if (!apiKey || apiKey === 'your-fun-asr-api-key') {
    return { text: '', success: false, error: 'API key not configured' };
  }

  try {
    const response = await fetch(ASR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'paraformer-v2',
        file_urls: [audioUrl],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errMsg = `ASR API error: ${response.status}`;
      error(errMsg);
      return { text: '', success: false, error: errMsg };
    }

    const data = (await response.json()) as {
      data?: { results?: Array<{ transcription?: { text?: string } }> };
    };
    const text = data?.data?.results?.[0]?.transcription?.text || '';

    info('ASR transcription completed', { textLength: text.length });
    return { text, success: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown ASR error';
    error('ASR transcription failed', { error: errMsg });
    return { text: '', success: false, error: errMsg };
  }
}

export function isASRConfigured(): boolean {
  const apiKey = process.env.FUN_ASR_API_KEY;
  return !!apiKey && apiKey !== 'your-fun-asr-api-key';
}
