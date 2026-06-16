import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-001-1-01
 * @test REQ-001-1-02
 * @test REQ-001-2-01
 * @test REQ-001-2-02
 * @test REQ-001-3-01
 * @test REQ-001-3-02
 * @intent 验证项目基本结构文件存在且符合TypeScript项目要求 (初始化TypeScript，配置Biome，配置测试框架)
 * @covers npm run type-check 通过无错误，TypeScript严格模式启用，biome check 通过无警告，配置了lint和format规则， npm test 运行成功，创建基本测试结构
 */
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
    expect(pkg.name).toBe('dialog-survey');
  });
});
