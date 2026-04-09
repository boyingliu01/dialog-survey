import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

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
