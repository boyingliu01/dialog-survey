import { describe, it, expect } from 'vitest';
import { getAsrService, initializeAsrService } from '../../../src/services/asr/index.js';

describe('ASR Service', () => {
  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const service = getAsrService();
      expect(service).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const config = {
        appKey: 'test-key',
        appSecret: 'test-secret',
        baseUrl: 'https://test-api.com',
      };

      const service = initializeAsrService(config);
      expect(service).toBeDefined();
    });
  });

  describe('Transcription', () => {
    it('should transcribe audio URL with mock provider', async () => {
      const service = getAsrService();
      const result = await service.transcribe('https://example.com/audio.wav');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should transcribe audio from file path', async () => {
      const service = getAsrService();
      const result = await service.transcribeFromFile('/path/to/audio.wav');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });

    it('should transcribe audio from buffer', async () => {
      const service = getAsrService();
      const buffer = Buffer.from('test audio data');
      const result = await service.transcribeFromBuffer(buffer);

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });
  });
});
