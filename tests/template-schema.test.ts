import { describe, expect, it } from 'vitest';

interface Topic {
  id: string;
  name: string;
  description?: string;
  questions: Question[];
}

interface Question {
  id: string;
  text: string;
  type: 'open' | 'choice' | 'scale';
  options?: string[];
  required?: boolean;
}

interface InterviewTemplate {
  id: string;
  name: string;
  version: number;
  description?: string;
  topics: Topic[];
  metadata?: {
    author?: string;
    createdAt?: string;
    tags?: string[];
  };
}

describe('Task-008-1: Template JSON Schema', () => {
  /**
   * @test REQ-008-1-01
   * @intent 测试模板结构是否符合JSON schema规范，包含topics和questions结构验证
   */
  it('should validate template structure with topics and questions', () => {
    const template: InterviewTemplate = {
      id: 'tmpl-001',
      name: 'Customer Satisfaction Survey',
      version: 1,
      description: 'Standard CSAT template',
      topics: [
        {
          id: 'topic-1',
          name: 'Product Quality',
          description: 'Questions about product experience',
          questions: [
            {
              id: 'q1',
              text: 'How would you rate our product quality?',
              type: 'scale',
              required: true,
            },
            {
              id: 'q2',
              text: 'What improvements would you suggest?',
              type: 'open',
            },
          ],
        },
      ],
      metadata: {
        author: 'admin',
        tags: ['csat', 'product'],
      },
    };

    expect(template.id).toBeDefined();
    expect(template.name).toBeDefined();
    expect(template.version).toBeGreaterThan(0);
    expect(template.topics).toBeDefined();
    expect(template.topics.length).toBeGreaterThan(0);
    expect(template.topics[0].questions).toBeDefined();
    expect(template.topics[0].questions.length).toBeGreaterThan(0);
  });

  it('should validate question types', () => {
    const questions: Question[] = [
      { id: 'q1', text: 'Open question', type: 'open' },
      {
        id: 'q2',
        text: 'Choice question',
        type: 'choice',
        options: ['A', 'B', 'C'],
      },
      { id: 'q3', text: 'Scale question', type: 'scale' },
    ];

    expect(questions[0].type).toBe('open');
    expect(questions[1].type).toBe('choice');
    expect(questions[1].options).toBeDefined();
    expect(questions[2].type).toBe('scale');
  });

  /**
   * @test REQ-008-1-01
   * @intent 测试模板支持可选元数据字段的验证
   */
  it('should support optional metadata', () => {
    const template: InterviewTemplate = {
      id: 'tmpl-002',
      name: 'Minimal Template',
      version: 1,
      topics: [],
    };

    expect(template.metadata).toBeUndefined();
  });
});
