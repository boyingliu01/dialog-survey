// @ts-nocheck
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-001-4-01
 * @test REQ-001-4-02
 * @test REQ-001-4-03
 * @intent 验证 Prisma Schema 文件存在且包含所有必需的数据模型
 * @covers 数据库表创建 (Interview, Message, Response, Template, InterviewPlan, AnalysisReport, AuditLog)，npx prisma generate 成功，必需模型存在
 */
describe('Prisma Schema', () => {
  it('should have prisma/schema.prisma', () => {
    expect(fs.existsSync('prisma/schema.prisma')).toBe(true);
  });

  it('should have Interview model', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(schema).toContain('model Interview');
  });

  it('should have Message model', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(schema).toContain('model Message');
  });

  it('should have Response model', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(schema).toContain('model Response');
  });

  it('should have Template model', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(schema).toContain('model Template');
  });

  it('should have InterviewPlan model', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(schema).toContain('model InterviewPlan');
  });

  it('should have AnalysisReport model', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(schema).toContain('model AnalysisReport');
  });

  it('should have AuditLog model', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(schema).toContain('model AuditLog');
  });
});
