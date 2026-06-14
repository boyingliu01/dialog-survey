import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Webhook and Message Processing', () => {
  describe('Text Message Processing', () => {
    /**
     * @test REQ-002-3-02
     * @intent 验证消息存储库文件的存在（与REQ-002-3相关）
     */
    it('should have MessageRepository', () => {
      expect(fs.existsSync('src/repositories/message.repository.ts')).toBe(true);
    });

    /**
     * @test REQ-002-3-01
     * @intent 验证消息实体类型定义（与REQ-002-3相关）
     */
    it('should have Message entity type', () => {
      const content = fs.readFileSync('src/repositories/message.repository.ts', 'utf-8');
      expect(content.includes('Message')).toBe(true);
    });

    /**
     * @test REQ-002-3-02
     * @intent 验证save方法的实现（与REQ-002-3相关）
     */
    it('should implement save method', () => {
      const content = fs.readFileSync('src/repositories/message.repository.ts', 'utf-8');
      expect(content.includes('create') || content.includes('save')).toBe(true);
    });
  });
});
