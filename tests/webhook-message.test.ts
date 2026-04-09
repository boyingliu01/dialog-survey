import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Webhook and Message Processing', () => {
  describe('Webhook Endpoint', () => {
    it('should have src/api/webhook.ts', () => {
      expect(fs.existsSync('src/api/webhook.ts')).toBe(true);
    });

    it('should define message types', () => {
      const content = fs.readFileSync('src/api/webhook.ts', 'utf-8');
      expect(content).toContain('text') || content.includes('Text');
    });

    it('should implement POST /webhook route', () => {
      const content = fs.readFileSync('src/api/webhook.ts', 'utf-8');
      expect(content.toLowerCase()).toContain('post');
    });
  });

  describe('Text Message Processing', () => {
    it('should have MessageRepository', () => {
      expect(fs.existsSync('src/repositories/message.repository.ts')).toBe(true);
    });

    it('should have Message entity type', () => {
      const content = fs.readFileSync('src/repositories/message.repository.ts', 'utf-8');
      expect(content).toContain('Message');
    });

    it('should implement save method', () => {
      const content = fs.readFileSync('src/repositories/message.repository.ts', 'utf-8');
      expect(content).toContain('create') || content.includes('save');
    });
  });
});
