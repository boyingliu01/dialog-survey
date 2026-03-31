export interface ASRConfig {
  appKey: string;
  appSecret: string;
  baseUrl?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
}

export interface ASRProvider {
  readonly name: string;
  transcribe(audioUrl: string): Promise<TranscriptionResult>;
}
