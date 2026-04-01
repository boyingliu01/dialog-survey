import { ASRConfig, ASRProvider, TranscriptionResult } from "./types";

export class ASRServiceError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ASRServiceError";
  }
}

export class AudioFormatError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AudioFormatError";
  }
}

export class MockASRProvider implements ASRProvider {
  public readonly name: string = "mock";

  async transcribe(_audioUrl: string): Promise<TranscriptionResult> {
    // Simulate transcription delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      text: "[语音转文字结果]",
      confidence: 0.95,
      duration: 5,
    };
  }
}

export class FunASRProvider implements ASRProvider {
  public readonly name: string = "funasr";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: ASRConfig) {
    // config is stored for future use when FunASR API is implemented
  }

  async transcribe(_audioUrl: string): Promise<TranscriptionResult> {
    try {
      // TODO: Implement actual FunASR API call
      // For now, return mock result
      // Simulate transcription
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return {
        text: "这是语音识别的结果",
        confidence: 0.98,
        duration: 8,
      };
    } catch (error) {
      if (error instanceof ASRServiceError) {
        throw error;
      }
      throw new ASRServiceError(
        `Transcription failed: ${(error as Error).message}`,
        "TRANSCRIPTION_FAILED",
        error,
      );
    }
  }
}

export class ASRService {
  private static instance: ASRService | null = null;

  private readonly provider: ASRProvider;

  private constructor(provider: ASRProvider) {
    this.provider = provider;
  }

  static initialize(config: ASRConfig): ASRService {
    if (!ASRService.instance) {
      const provider = new FunASRProvider(config);
      ASRService.instance = new ASRService(provider);
    }
    return ASRService.instance;
  }

  static getInstance(): ASRService {
    if (!ASRService.instance) {
      const provider = new MockASRProvider();
      ASRService.instance = new ASRService(provider);
    }
    return ASRService.instance;
  }

  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    try {
      return await this.provider.transcribe(audioUrl);
    } catch (error) {
      // Fallback to mock if real ASR fails
      if (
        !(error instanceof AudioFormatError) &&
        this.provider.name !== "mock"
      ) {
        console.warn(
          `ASR failed with ${this.provider.name}, falling back to mock:`,
          error,
        );
        return new MockASRProvider().transcribe(audioUrl);
      }
      throw error;
    }
  }

  async transcribeFromFile(filePath: string): Promise<TranscriptionResult> {
    // For file path, we can simulate or implement file processing
    return this.transcribe(filePath);
  }

  async transcribeFromBuffer(_audioData: Buffer): Promise<TranscriptionResult> {
    // For buffer, we can simulate or implement buffer processing
    return {
      text: "[语音转文字结果]",
      confidence: 0.92,
      duration: 6,
    };
  }
}

let asrServiceInstance: ASRService | null = null;

export function getAsrService(): ASRService {
  if (!asrServiceInstance) {
    asrServiceInstance = ASRService.getInstance();
  }
  return asrServiceInstance;
}

export function initializeAsrService(config: ASRConfig): ASRService {
  asrServiceInstance = ASRService.initialize(config);
  return asrServiceInstance;
}
