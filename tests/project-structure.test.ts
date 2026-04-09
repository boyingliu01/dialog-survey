import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Project Structure', () => {
  it('should have package.json', () => {
    expect(fs.existsSync('package.json')).toBe(true);
  });

  it('should have tsconfig.json', () => {
    expect(fs.existsSync('tsconfig.json')).toBe(true);
  });

  it('should have biome.json', () => {
    expect(fs.existsSync('biome.json')).toBe(true);
  });

  it('should have vitest.config.ts', () => {
    expect(fs.existsSync('vitest.config.ts')).toBe(true);
  });

  it('should have valid package.json with correct name', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    expect(pkg.name).toBe('interview-bot');
  });
});
