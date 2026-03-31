import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateLoader, InterviewTemplateSchema } from '../../../src/services/templateLoader';

describe('TemplateLoader', () => {
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

      // Mock file system
      const mockFs = vi.hoisted(() => ({
        readdirSync: vi.fn(),
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
      }));

      mockFs.readdirSync.mockReturnValue(['template1.json']);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        id: 'template1',
        name: 'Template 1',
        description: 'Description 1',
        topics: [],
        questions: [],
      }));

      vi.doMock('fs', () => mockFs);
      vi.doMock('path', () => ({
        join: vi.fn().mockImplementation((a, b) => `${a}/${b}`),
        resolve: vi.fn().mockImplementation(x => x),
        dirname: vi.fn(),
        basename: vi.fn(),
      }));

      const loader = new TemplateLoader(mockTemplatesDir);
      const template = await loader.loadTemplate('template1');

      expect(template).not.toBeNull();
      expect(template?.id).toBe('template1');
    });

    it('should return null for non-existent template', async () => {
      const mockTemplatesDir = '/mock/templates';

      const mockFs = vi.hoisted(() => ({
        readdirSync: vi.fn(),
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
      }));

      mockFs.readdirSync.mockReturnValue(['template1.json']);
      mockFs.existsSync.mockReturnValue(false);

      vi.doMock('fs', () => mockFs);
      vi.doMock('path', () => ({
        join: vi.fn().mockImplementation((a, b) => `${a}/${b}`),
        resolve: vi.fn().mockImplementation(x => x),
        dirname: vi.fn(),
        basename: vi.fn(),
      }));

      const loader = new TemplateLoader(mockTemplatesDir);
      const template = await loader.loadTemplate('nonexistent');

      expect(template).toBeNull();
    });
  });

  describe('list templates', () => {
    it('should return all templates', async () => {
      const mockTemplatesDir = '/mock/templates';

      const mockFs = vi.hoisted(() => ({
        readdirSync: vi.fn(),
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
      }));

      mockFs.readdirSync.mockReturnValue(['template1.json', 'template2.json']);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(file => {
        if (file.endsWith('template1.json')) {
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

      vi.doMock('fs', () => mockFs);
      vi.doMock('path', () => ({
        join: vi.fn().mockImplementation((a, b) => `${a}/${b}`),
        resolve: vi.fn().mockImplementation(x => x),
        dirname: vi.fn(),
        basename: vi.fn(),
      }));

      const loader = new TemplateLoader(mockTemplatesDir);
      const templates = await loader.listTemplates();

      expect(templates.length).toBe(2);
      expect(templates[0].id).toBe('template1');
      expect(templates[1].id).toBe('template2');
    });

    it('should return empty array when no templates exist', async () => {
      const mockTemplatesDir = '/mock/templates';

      const mockFs = vi.hoisted(() => ({
        readdirSync: vi.fn(),
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
      }));

      mockFs.readdirSync.mockReturnValue([]);

      vi.doMock('fs', () => mockFs);
      vi.doMock('path', () => ({
        join: vi.fn().mockImplementation((a, b) => `${a}/${b}`),
        resolve: vi.fn().mockImplementation(x => x),
        dirname: vi.fn(),
        basename: vi.fn(),
      }));

      const loader = new TemplateLoader(mockTemplatesDir);
      const templates = await loader.listTemplates();

      expect(templates).toEqual([]);
    });
  });
});
