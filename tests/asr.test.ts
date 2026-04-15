import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { transcribeAudio, isASRConfigured } from '../src/services/asr.service.js';

describe('ASR Service', () => {
  beforeEach(() => {
    vi.stubEnv('FUN_ASR_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('isASRConfigured', () => {
    /**
     * @test REQ-002-4-01
     * @intent 验证当配置了API密钥时函数正确返回true，确保ASR服务配置检查功能有效
     */
    it('should return true when API key is configured', () => {
      vi.stubEnv('FUN_ASR_API_KEY', 'valid-api-key');
      expect(isASRConfigured()).toBe(true);
    });

    /**
     * @test REQ-002-4-01
     * @intent 验证当未设置API密钥时函数正确返回false，确保ASR服务在未配置时不工作
     */
    it('should return false when API key is not set', () => {
      vi.stubEnv('FUN_ASR_API_KEY', '');
      expect(isASRConfigured()).toBe(false);
    });

    /**
     * @test REQ-002-4-01
     * @intent 验证当API密钥是占位符时函数正确返回false，防止默认占位符被视为有效配置
     */
    it('should return false when API key is placeholder', () => {
      vi.stubEnv('FUN_ASR_API_KEY', 'your-fun-asr-api-key');
      expect(isASRConfigured()).toBe(false);
    });
  });

  describe('transcribeAudio', () => {
    it('should return error when API key not configured', async () => {
      vi.stubEnv('FUN_ASR_API_KEY', 'your-fun-asr-api-key');

      const result = await transcribeAudio('https://example.com/audio.mp3');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API key not configured');
      expect(result.text).toBe('');
    });

    it('should return success with transcription text', async () => {
      const mockResponse = {
        data: {
          results: [
            {
              transcription: {
                text: 'This is the transcribed text from the audio file.',
              },
            },
          ],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await transcribeAudio('https://example.com/audio.mp3');

      expect(result.success).toBe(true);
      expect(result.text).toBe('This is the transcribed text from the audio file.');
    });

    it('should return error when API returns non-ok status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await transcribeAudio('https://example.com/audio.mp3');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ASR API error: 500');
      expect(result.text).toBe('');
    });

    it('should handle missing transcription text', async () => {
      const mockResponse = {
        data: {
          results: [{}],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await transcribeAudio('https://example.com/audio.mp3');

      expect(result.success).toBe(true);
      expect(result.text).toBe('');
    });

    it('should handle missing results array', async () => {
      const mockResponse = {
        data: {},
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await transcribeAudio('https://example.com/audio.mp3');

      expect(result.success).toBe(true);
      expect(result.text).toBe('');
    });

    it('should handle network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await transcribeAudio('https://example.com/audio.mp3');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.text).toBe('');
    });

    it('should handle unknown error type', async () => {
      global.fetch = vi.fn().mockRejectedValue('Unknown error string');

      const result = await transcribeAudio('https://example.com/audio.mp3');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown ASR error');
      expect(result.text).toBe('');
    });

    it('should send correct request body', async () => {
      const mockResponse = {
        data: {
          results: [{ transcription: { text: 'test' } }],
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      await transcribeAudio('https://example.com/audio.mp3');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers['Authorization']).toBe('Bearer test-api-key');
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('paraformer-v2');
      expect(body.file_urls).toContain('https://example.com/audio.mp3');
    });
  });
});
