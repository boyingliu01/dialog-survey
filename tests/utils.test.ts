import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Utility Classes', () => {
  describe('Encryption', () => {
    it('should have src/utils/encryption.ts', () => {
      expect(fs.existsSync('src/utils/encryption.ts')).toBe(true);
    });

    it('should export encrypt function', () => {
      const content = fs.readFileSync('src/utils/encryption.ts', 'utf-8');
      expect(content).toContain('export function encrypt');
    });

    it('should export decrypt function', () => {
      const content = fs.readFileSync('src/utils/encryption.ts', 'utf-8');
      expect(content).toContain('export function decrypt');
    });
  });

  describe('Date Utils', () => {
    it('should have src/utils/date.ts', () => {
      expect(fs.existsSync('src/utils/date.ts')).toBe(true);
    });

    it('should export formatDate function', () => {
      const content = fs.readFileSync('src/utils/date.ts', 'utf-8');
      expect(content).toContain('export function formatDate');
    });

    it('should export formatRelativeTime function', () => {
      const content = fs.readFileSync('src/utils/date.ts', 'utf-8');
      expect(content).toContain('export function formatRelativeTime');
    });
  });

  describe('Validation', () => {
    it('should have src/utils/validation.ts', () => {
      expect(fs.existsSync('src/utils/validation.ts')).toBe(true);
    });

    it('should export isValidEmail function', () => {
      const content = fs.readFileSync('src/utils/validation.ts', 'utf-8');
      expect(content).toContain('export function isValidEmail');
    });

    it('should export isValidPhone function', () => {
      const content = fs.readFileSync('src/utils/validation.ts', 'utf-8');
      expect(content).toContain('export function isValidPhone');
    });

    it('should export isValidUrl function', () => {
      const content = fs.readFileSync('src/utils/validation.ts', 'utf-8');
      expect(content).toContain('export function isValidUrl');
    });
  });
});
