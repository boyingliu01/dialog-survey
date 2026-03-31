import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs and path modules before importing the source
// Source uses default imports, so we mock default exports
vi.mock('fs', () => {
  const mockReaddirSync = vi.fn();
  const mockExistsSync = vi.fn();
  const mockReadFileSync = vi.fn();
  
  return {
    default: {
      readdirSync: mockReaddirSync,
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
    },
    readdirSync: mockReaddirSync,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

vi.mock('path', () => {
  const mockJoin = vi.fn((...args: string[]) => args.join('/'));
  const mockResolve = vi.fn((x: string) => x);
  
  return {
    default: {
      join: mockJoin,
      resolve: mockResolve,
    },
    join: mockJoin,
    resolve: mockResolve,
  };
});

// Import after mocking
import { TemplateLoader, InterviewTemplateSchema } from '../../../src/services/templateLoader.js';
import fs from 'fs';
import path from 'path';

// Get typed mock functions from the mocked modules
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockJoin = vi.mocked(path.join);

describe('TemplateLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('schema validation', () => {
    it('should validate valid templates', () => {
      const validTemplate = {
        id: 'testTemplate',
        name: 'Test Interview',
        description: 'A test interview template',
        topics: [
          {
            id: 'topic1',
            name: 'Test Topic',
            description: 'Test topic description',
            initial_question: 'Initial question',
          },
        ],
        questions: [
          {
            id: 'q1',
            type: 'text',
            text: 'First question',
          },
        ],
      };

      const result = InterviewTemplateSchema.safeParse(validTemplate);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validTemplate);
    });

    it('should reject templates with missing fields', () => {
      const invalidTemplate = {
        name: 'Test Interview', // Missing id and topics
        description: 'A test interview template',
        questions: [],
      };

      const result = InterviewTemplateSchema.safeParse(invalidTemplate);

      expect(result.success).toBe(false);
    });

    it('should reject templates with invalid question type', () => {
      const invalidTemplate = {
        id: 'testTemplate',
        name: 'Test Interview',
        description: 'A test interview template',
        topics: [
          {
            id: 'topic1',
            name: 'Test Topic',
            description: 'Test topic description',
            initial_question: 'Initial question',
          },
        ],
        questions: [
          {
            id: 'q1',
            type: 'invalid_type', // Invalid question type
            text: 'First question',
          },
        ],
      };

      const result = InterviewTemplateSchema.safeParse(invalidTemplate);

      expect(result.success).toBe(false);
    });
  });

  describe('template loading', () => {
    it('should return template by id', async () => {
      const mockTemplatesDir = '/mock/templates';

      mockReaddirSync.mockReturnValue(['template1.json']);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({
        id: 'template1',
        name: 'Template 1',
        description: 'Description 1',
        topics: [],
        questions: [],
      }));

      const loader = new TemplateLoader(mockTemplatesDir);
      const template = await loader.loadTemplate('template1');

      expect(template).not.toBeNull();
      expect(template?.id).toBe('template1');
    });

    it('should return null for non-existent template', async () => {
      const mockTemplatesDir = '/mock/templates';

      mockReaddirSync.mockReturnValue(['template1.json']);
      mockExistsSync.mockReturnValue(false);

      const loader = new TemplateLoader(mockTemplatesDir);
      const template = await loader.loadTemplate('nonexistent');

      expect(template).toBeNull();
    });
  });

  describe('list templates', () => {
    it('should return all templates', async () => {
      const mockTemplatesDir = '/mock/templates';

      mockReaddirSync.mockReturnValue(['template1.json', 'template2.json']);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((file: unknown) => {
        const filePath = String(file);
        if (filePath.endsWith('template1.json')) {
          return JSON.stringify({
            id: 'template1',
            name: 'Template 1',
            description: 'Description 1',
            topics: [],
            questions: [],
          });
        }
        return JSON.stringify({
          id: 'template2',
          name: 'Template 2',
          description: 'Description 2',
          topics: [],
          questions: [],
        });
      });

      const loader = new TemplateLoader(mockTemplatesDir);
      const templates = await loader.listTemplates();

      expect(templates.length).toBe(2);
      expect(templates[0].id).toBe('template1');
      expect(templates[1].id).toBe('template2');
    });

    it('should return empty array when no templates exist', async () => {
      const mockTemplatesDir = '/mock/templates';

      mockReaddirSync.mockReturnValue([]);

      const loader = new TemplateLoader(mockTemplatesDir);
      const templates = await loader.listTemplates();

      expect(templates).toEqual([]);
    });
  });
});