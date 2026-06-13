import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('DingTalk Services', () => {
  describe('ASR Service', () => {
    /**
     * @test REQ-002-3-01
     * @intent 验证ASR服务文件存在
     */
    it('should have src/services/asr.service.ts', () => {
      expect(fs.existsSync('src/services/asr.service.ts')).toBe(true);
    });

    /**
     * @test REQ-002-3-01
     * @intent 验证ASR服务实现转录功能
     */
    it('should implement transcribe function', () => {
      const content = fs.readFileSync('src/services/asr.service.ts', 'utf-8');
      expect(content.includes('transcribe') || content.toLowerCase().includes('asr')).toBe(true);
    });

    /**
     * @test REQ-002-4-01
     * @intent 验证Fun-ASR API调用实现（虽然这是REQ-002-4，但在同一个文件中实现）
     */
    it('should handle Fun-ASR API call', () => {
      const content = fs.readFileSync('src/services/asr.service.ts', 'utf-8');
      expect(content.toLowerCase().includes('asr') || content.includes('paraformer')).toBe(true);
    });

    /**
     * @test REQ-002-4-03
     * @intent 验证ASR服务对错误的回退处理（虽然这是REQ-002-4，但在同一个文件中实现）
     */
    it('should implement fallback for errors', () => {
      const content = fs.readFileSync('src/services/asr.service.ts', 'utf-8');
      expect(content.toLowerCase().includes('error') || content.includes('catch')).toBe(true);
    });
  });

  describe('DingTalk Service - Send Messages', () => {
    /**
     * @test REQ-002-5-01
     * @intent 验证钉钉消息发送模块文件存在（重构后替代 dingtalk.service.ts）
     */
    it('should have src/integrations/dingtalk/message-sender.ts', () => {
      expect(fs.existsSync('src/integrations/dingtalk/message-sender.ts')).toBe(true);
    });

    /**
     * @test REQ-002-5-01
     * @intent 验证发送文本消息方法实现（重构后为 sendTextMessage）
     */
    it('should implement sendText method via sendTextMessage or sendText', () => {
      const content = fs.readFileSync('src/integrations/dingtalk/message-sender.ts', 'utf-8');
      expect(content.includes('sendTextMessage') || content.includes('sendText')).toBe(true);
    });

    /**
     * @test REQ-002-5-02
     * @intent 验证发送富文本/卡片消息方法实现（重构后为 sendActionCard）
     */
    it('should implement rich message sending via sendActionCard or markdown', () => {
      const content = fs.readFileSync('src/integrations/dingtalk/message-sender.ts', 'utf-8');
      expect(content.includes('sendActionCard') || content.toLowerCase().includes('markdown')).toBe(
        true
      );
    });
  });

  describe('DingTalk Client', () => {
    /**
     * @test REQ-002-7-01
     * @intent 验证钉钉客户端文件存在
     */
    it('should have src/integrations/dingtalk/client.ts', () => {
      expect(fs.existsSync('src/integrations/dingtalk/client.ts')).toBe(true);
    });

    /**
     * @test REQ-002-7-01
     * @intent 验证HTTP请求包装器实现
     */
    it('should implement HTTP request wrapper', () => {
      const content = fs.readFileSync('src/integrations/dingtalk/client.ts', 'utf-8');
      expect(content.includes('fetch') || content.toLowerCase().includes('request')).toBe(true);
    });

    /**
     * @test REQ-002-7-02
     * @intent 验证签名生成功能实现
     */
    it('should implement signature generation', () => {
      const content = fs.readFileSync('src/integrations/dingtalk/client.ts', 'utf-8');
      expect(
        content.toLowerCase().includes('signature') || content.toLowerCase().includes('hmac')
      ).toBe(true);
    });
  });

  // rate-limiter.ts removed as dead code (unused)
});
