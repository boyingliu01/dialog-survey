import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL, VolcengineLLM } from '../integrations/llm/volcengine.js';
import { info } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';

export interface Report {
  interviewId: string;
  content: string;
  keyFindings: string[];
  sentiment: string;
  recommendations: string[];
  generatedAt: Date;
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

  const llm = VolcengineLLM.fromEnv();

  try {
    const response = await withRetry(() =>
      llm.chat({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
      })
    );

    const content = response.content;
    const parsed = parseReportContent(content);

    const report: Report = {
      interviewId,
      content,
      keyFindings: parsed.keyFindings,
      sentiment: parsed.sentiment,
      recommendations: parsed.recommendations,
      generatedAt: new Date(),
    };

    await saveReport(report);
    return report;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    info('Report generation failed, using fallback', { error: errorMsg });
    return createFallbackReport(interviewId, topic, qaPairs);
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

  const findingMatch = content.match(/关键发现[:：]\s*([\s\S]*?)(?=情感分析|行动建议|$)/i);
  if (findingMatch) {
    const findings = findingMatch[1].split(/[\n，,]/).filter((f) => f.trim());
    keyFindings.push(...findings.slice(0, 5));
  }

  const sentimentMatch = content.match(/情感分析[:：]\s*([\n，,]?\s*[\u4e00-\u9fa5a-zA-Z]+)/i);
  if (sentimentMatch) {
    sentiment = sentimentMatch[1].trim().toLowerCase();
  }

  const recMatch = content.match(/行动建议[:：]\s*([\s\S]*)/i);
  if (recMatch) {
    const recs = recMatch[1].split(/[\n，,]/).filter((r) => r.trim());
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
  const reportsDir = process.env.REPORTS_DIR || './reports';
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
  llm: VolcengineLLM
): Promise<ReportWithDimensions> {
  const qaText = qaPairs.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');

  const prompt = promptService.render('analyzeWithDimensions', {
    dimensions: dimensionsJson || '[No preset dimensions]',
    qaPairs: qaText,
  });

  try {
    const response = await withRetry(() =>
      llm.chat({
        model: DEFAULT_MODEL,
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
    const jsonStr = JSON.parse(cleaned) as Record<string, any>;
    return {
      dimensionTags: jsonStr.dimensionTags || [],
      emergentTags: jsonStr.emergentTags || [],
      interviewerRating: jsonStr.interviewerRating || undefined,
    };
  } catch {
    return { dimensionTags: [], emergentTags: [] };
  }
}
