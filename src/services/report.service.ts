import fs from 'node:fs';
import path from 'node:path';
import { OpenAICompatibleLLM } from '../integrations/llm/openai-compatible.js';
import { info, error } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';

export interface Report {
  interviewId: string;
  content: string;
  keyFindings: string[];
  sentiment: string;
  recommendations: string[];
  generatedAt: Date;
  usedLLM?: boolean;
}

export interface ReportWithDimensions extends Report {
  dimensionTags?: Array<{
    dimensionId: string;
    label: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    quotes: string[];
  }>;
  emergentTags?: string[];
  interviewerRating?: number;
}

export async function generateReport(
  interviewId: string,
  topic: string,
  qaPairs: Array<{ question: string; answer: string }>
): Promise<Report> {
  info('Generating report', { interviewId, qaCount: qaPairs.length });

  const qaText = qaPairs.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');
  const prompt = promptService.render('generateReport', {
    topic,
    qaPairs: qaText,
  });

  const llm = OpenAICompatibleLLM.fromEnv();

  try {
    const response = await withRetry(() =>
      llm.chat({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
      })
    );

    const content = response.content;
    
    if (!content || content.trim().length === 0) {
      error('LLM returned empty content, using fallback', { interviewId });
      return createFallbackReport(interviewId, topic, qaPairs);
    }
    
    const parsed = parseReportContent(content);

    const report: Report = {
      interviewId,
      content,
      keyFindings: parsed.keyFindings,
      sentiment: parsed.sentiment,
      recommendations: parsed.recommendations,
      generatedAt: new Date(),
      usedLLM: true,
    };

    info('LLM report generated successfully', {
      interviewId,
      contentLength: content.length,
      keyFindingsCount: parsed.keyFindings.length,
      recommendationsCount: parsed.recommendations.length,
    });

    await saveReport(report);
    return report;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    error('LLM report generation FAILED, using fallback', { interviewId, error: errorMsg });
    const fallbackReport = createFallbackReport(interviewId, topic, qaPairs);
    fallbackReport.usedLLM = false;
    return fallbackReport;
  }
}

function parseReportContent(content: string): {
  keyFindings: string[];
  sentiment: string;
  recommendations: string[];
} {
  const keyFindings: string[] = [];
  let sentiment = 'neutral';
  const recommendations: string[] = [];

  const cleanText = (text: string): string => {
    return text
      .replace(/^#+\s*/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\|/g, ' ')
      .replace(/^[-=]{3,}$/, '')
      .replace(/^\s*[-*+]\s*$/, '')
      .trim();
  };

  const isTableOrFormatting = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;
    if (/^[-=|:\s]+$/.test(trimmed)) return true;
    if (/^\|?[\s-|:]+\|?$/.test(trimmed)) return true;
    return false;
  };

  // Support both "### 1. 关键发现" (Markdown header) and "关键发现:" formats
  const findingMatch =
    content.match(/[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i) ||
    content.match(/关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i);
  if (findingMatch) {
    const findings = findingMatch[1]
      .split(/[\n]+/)
      .map((f) =>
        f
          .replace(/^[-*•]\s*/, '')
          .replace(/^\d+\.\s*/, '')
          .trim()
      )
      .map(cleanText)
      .filter((f) => f.length > 0 && !isTableOrFormatting(f));
    keyFindings.push(...findings.slice(0, 5));
  }

  // Support both "### 2. 情感分析" and "情感分析:" formats
  const sentimentMatch =
    content.match(/情感分析[:：]\s*([\u4e00-\u9fa5]+)/i) ||
    content.match(
      /情感分析[\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
    );
  if (sentimentMatch) {
    const raw = sentimentMatch[1].trim().toLowerCase();
    if (raw.includes('积极') || raw.includes('正面') || raw === 'positive') {
      sentiment = 'positive';
    } else if (raw.includes('消极') || raw.includes('负面') || raw === 'negative') {
      sentiment = 'negative';
    } else {
      sentiment = 'neutral';
    }
  }

  // Support both "### 3. 行动建议" and "行动建议:" formats
  const recMatch =
    content.match(/行动建议[:：]?\s*\n?([\s\S]*?)(?=总结|$)/i) ||
    content.match(/行动建议[\s\S]*?([\s\S]*)/i);
  if (recMatch) {
    const recs = recMatch[1]
      .split(/[\n]+/)
      .map((r) =>
        r
          .replace(/^[-*•]\s*/, '')
          .replace(/^\d+\.\s*/, '')
          .trim()
      )
      .map(cleanText)
      .filter((r) => r.length > 0 && !isTableOrFormatting(r));
    recommendations.push(...recs.slice(0, 5));
  }

  return { keyFindings, sentiment, recommendations };
}

function createFallbackReport(
  interviewId: string,
  topic: string,
  qaPairs: Array<{ question: string; answer: string }>
): Report {
  return {
    interviewId,
    content: `# 访谈报告\n\n主题: ${topic}\n\n问答记录:\n${qaPairs.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}`,
    keyFindings: qaPairs.map((qa) => qa.answer.substring(0, 50)),
    sentiment: 'neutral',
    recommendations: ['建议进行更深入的后续访谈'],
    generatedAt: new Date(),
  };
}

async function saveReport(report: Report): Promise<string> {
  const reportsDir = process.env['REPORTS_DIR'] || './reports';
  const filename = `${report.interviewId}_${Date.now()}.md`;
  const filepath = path.join(reportsDir, filename);

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(filepath, report.content);

  info('Report saved', { filepath });
  return filepath;
}

export async function generateReportWithDimensions(
  interviewId: string,
  _topic: string,
  qaPairs: Array<{ question: string; answer: string }>,
  dimensionsJson: string | null,
  llm: OpenAICompatibleLLM
): Promise<ReportWithDimensions> {
  const qaText = qaPairs.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');

  const prompt = promptService.render('analyzeWithDimensions', {
    dimensions: dimensionsJson || '[No preset dimensions]',
    qaPairs: qaText,
  });

  try {
    const response = await withRetry(() =>
      llm.chat({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.1,
      })
    );

    const parsed = parseDimensionAnalysis(response.content);

    return {
      interviewId,
      content: response.content,
      keyFindings: [],
      sentiment: '',
      recommendations: [],
      generatedAt: new Date(),
      ...parsed,
    };
  } catch (e) {
    info('Dimension analysis failed', {
      interviewId,
      error: (e as Error).message,
    });
    return {
      interviewId,
      content: '',
      keyFindings: [],
      sentiment: '',
      recommendations: [],
      generatedAt: new Date(),
      dimensionTags: [],
      emergentTags: [],
    };
  }
}

function parseDimensionAnalysis(
  content: string
): Pick<ReportWithDimensions, 'dimensionTags' | 'emergentTags' | 'interviewerRating'> {
  try {
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const jsonRaw = JSON.parse(cleaned);
    if (typeof jsonRaw !== 'object' || jsonRaw === null) {
      return { dimensionTags: [], emergentTags: [] };
    }
    const jsonStr = jsonRaw as Record<string, unknown>;
    const rating =
      typeof jsonStr['interviewerRating'] === 'number' ? jsonStr['interviewerRating'] : undefined;
    return {
      dimensionTags: Array.isArray(jsonStr['dimensionTags']) ? jsonStr['dimensionTags'] : [],
      emergentTags: Array.isArray(jsonStr['emergentTags']) ? jsonStr['emergentTags'] : [],
      ...(rating != null ? { interviewerRating: rating } : {}),
    };
  } catch {
    return { dimensionTags: [], emergentTags: [] };
  }
}
