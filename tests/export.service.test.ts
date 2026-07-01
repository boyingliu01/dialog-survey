import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ExportService } from '../src/services/export.service.js';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

describe('ExportService', () => {
  let service: ExportService;
  let tmpDir: string;
  let mockPrisma: {
    interview: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    analysisReport: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'export-test-'));
    mockPrisma = {
      interview: {
        findUnique: vi.fn(),
      },
      analysisReport: {
        findFirst: vi.fn(),
      },
    };
    service = new ExportService(mockPrisma as any, tmpDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('exportInterviewToPdf', () => {
    it('should generate PDF with interview responses', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'iv-1',
        userId: 'user-001',
        status: 'COMPLETED',
        templateId: 'tpl-1',
        responses: [
          { questionId: 'Q1', content: '答案A', isFollowup: false, followupDepth: 0 },
          { questionId: 'Q2', content: '答案B', isFollowup: true, followupDepth: 1 },
        ],
      });
      mockPrisma.analysisReport.findFirst.mockResolvedValue({
        content: '报告内容\n关键发现：很好',
        keyFindings: ['发现1'],
        sentiment: 'positive',
        recommendations: ['建议1'],
      });

      const pdfPath = await service.exportInterviewToPdf('iv-1');

      expect(pdfPath).toBeTruthy();
      expect(pdfPath).toContain('.pdf');
      const pdfBytes = readFileSync(pdfPath);
      expect(pdfBytes.length).toBeGreaterThan(100);
      expect(pdfBytes.toString().startsWith('%PDF')).toBe(true);
    });

    it('should throw when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      await expect(service.exportInterviewToPdf('iv-missing')).rejects.toThrow(
        'Interview not found'
      );
    });

    it('should work without report', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'iv-2',
        userId: 'user-002',
        status: 'ACTIVE',
        templateId: 'tpl-1',
        responses: [{ questionId: 'Q1', content: '答案C', isFollowup: false, followupDepth: 0 }],
      });
      mockPrisma.analysisReport.findFirst.mockResolvedValue(null);

      const pdfPath = await service.exportInterviewToPdf('iv-2');
      expect(pdfPath).toBeTruthy();
      expect(readFileSync(pdfPath).length).toBeGreaterThan(100);
    });

    it('should produce valid PDF with Chinese text when CJK font is available', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'iv-1',
        userId: 'user-001',
        status: 'COMPLETED',
        templateId: 'tpl-1',
        responses: [
          { questionId: 'Q1', content: '测试中文回答', isFollowup: false, followupDepth: 0 },
        ],
      });
      mockPrisma.analysisReport.findFirst.mockResolvedValue({
        content: '报告摘要内容',
        keyFindings: ['关键发现一'],
        sentiment: 'positive',
        recommendations: ['改进建议'],
      });

      const pdfPath = await service.exportInterviewToPdf('iv-1');
      const pdfBytes = readFileSync(pdfPath);

      expect(pdfBytes.length).toBeGreaterThan(100);
      expect(pdfBytes.toString().startsWith('%PDF')).toBe(true);

      // When CJK font is available, PDF should have ToUnicode CMap for text extraction
      const pdfStr = pdfBytes.toString('latin1');
      expect(pdfStr).toMatch(/\/ToUnicode\s+\d+\s+\d+\s+R/);
    });
  });

  describe('exportInterviewToExcel', () => {
    it('should generate Excel with response rows', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'iv-1',
        userId: 'user-001',
        status: 'COMPLETED',
        templateId: 'tpl-1',
        template: {
          content: JSON.stringify({ questions: ['你的名字是什么？', '你喜欢什么颜色？'] }),
        },
        responses: [
          { questionId: 'q0', content: '答案A', isFollowup: false, followupDepth: 0 },
          { questionId: 'q1', content: '答案B', isFollowup: true, followupDepth: 1 },
        ],
      });
      mockPrisma.analysisReport.findFirst.mockResolvedValue(null);

      const xlsxPath = await service.exportInterviewToExcel('iv-1');

      expect(xlsxPath).toBeTruthy();
      expect(xlsxPath).toContain('.xlsx');

      const wb = XLSX.readFile(xlsxPath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        question: '你的名字是什么？',
        answer: '答案A',
        isFollowup: '否',
      });
      expect(rows[1]).toMatchObject({
        question: '你喜欢什么颜色？',
        answer: '答案B',
        isFollowup: '是',
      });
    });

    it('should include report summary sheet when report exists', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'iv-3',
        userId: 'user-003',
        status: 'COMPLETED',
        templateId: 'tpl-1',
        template: { content: JSON.stringify({ questions: ['问题一'] }) },
        responses: [{ questionId: 'q0', content: '答案', isFollowup: false, followupDepth: 0 }],
      });
      mockPrisma.analysisReport.findFirst.mockResolvedValue({
        content: '分析报告内容',
        keyFindings: ['发现A', '发现B'],
        sentiment: 'positive',
        recommendations: ['建议X'],
      });

      const xlsxPath = await service.exportInterviewToExcel('iv-3');

      const wb = XLSX.readFile(xlsxPath);
      expect(wb.SheetNames).toContain('访谈回答');
      expect(wb.SheetNames.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      await expect(service.exportInterviewToExcel('iv-missing')).rejects.toThrow(
        'Interview not found'
      );
    });
  });
});
