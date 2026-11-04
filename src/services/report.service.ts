import fs from 'node:fs';
import path from 'node:path';
import { OpenAICompatibleLLM } from '../integrations/llm/openai-compatible.js';
import { error, info } from '../utils/logger.js';
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

/**
 * Empty dimension report for an interview — the placeholder used before the LLM
 * runs and the value returned when dimension analysis fails, so a caller always
 * gets a renderable shape instead of an undefined result.
 */
export function createEmptyDimensionReport(interviewId: string): ReportWithDimensions {
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
      // `usedLLM` must be stamped here too, exactly as on the throw path. This
      // returned the bare fallback, so a model that answered with an empty body
      // produced a report whose `usedLLM` was `undefined` while a model that
      // threw produced `false` -- two spellings of "degraded" for the same
      // outcome, and the caller checking `=== false` missed half the outages.
      return { ...createFallbackReport(interviewId, topic, qaPairs), usedLLM: false };
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

/** First regex that matches, so a stricter pattern can be tried before a looser one. */
function firstMatch(text: string, patterns: readonly RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

/** Capture group 1 of the first matching pattern, or undefined. */
function captureAfter(text: string, patterns: readonly RegExp[]): string | undefined {
  return firstMatch(text, patterns)?.[1];
}

function parseReportContent(content: string): {
  keyFindings: string[];
  sentiment: string;
  recommendations: string[];
} {
  // Each section accepts both "### 1. 关键发现" (Markdown header) and "关键发现:"
  // forms, and the bullet extraction is shared, so the only per-section facts
  // are the two patterns and how the captured text becomes the stored value.
  //
  // The lookahead must stop at ANY Markdown heading, not just one containing
  // "建议". With `### .*建议` alone, a document whose sections render as
  // "### 2. 情感分析" was not a stop point, so the findings capture ran past it
  // and swallowed the next header -- "### 2." itself became a bullet item.
  //
  // End-of-section is `(?![\s\S])`, not `$`: these patterns carry the `m` flag
  // (needed for `^#{1,6}`), and under `m` a bare `$` means "end of ANY line", so
  // it fired after the first bullet and truncated every multi-line section to a
  // single item. `(?![\s\S])` is the only spelling that means "end of input".
  const findings = captureAfter(content, [
    /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|^#{1,6}\s|(?![\s\S]))/im,
    /关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议|^#{1,6}\s|(?![\s\S]))/im,
  ]);
  const sentiment = captureAfter(content, [
    /情感分析[:：]\s*([\u4e00-\u9fa5]+)/i,
    /情感分析[\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i,
  ]);
  const recommendations = captureAfter(content, [
    /行动建议[:：]?\s*\n?([\s\S]*?)(?=总结|$)/i,
    /行动建议[\s\S]*?([\s\S]*)/i,
  ]);

  return {
    keyFindings: findings === undefined ? [] : extractBulletLines(findings),
    sentiment: sentiment === undefined ? 'neutral' : normaliseSentiment(sentiment),
    recommendations: recommendations === undefined ? [] : extractBulletLines(recommendations),
  };
}

/** Strip Markdown emphasis, code spans, HTML tags and table pipes from a line. */
function cleanText(text: string): string {
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
}

/** True for lines that carry no content: blank, table rules, separators. */
function isTableOrFormatting(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  if (/^[-=|:\s]+$/.test(trimmed)) return true;
  if (/^\|?[\s-|:]+\|?$/.test(trimmed)) return true;
  return false;
}

/**
 * Turn a captured Markdown block into clean bullet items, capped at five.
 *
 * Shared by the key-findings and recommendations sections, whose parsing rules
 * were duplicated verbatim.
 */
function extractBulletLines(block: string): string[] {
  return block
    .split(/[\n]+/)
    .map((line) =>
      line
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+\.\s*/, '')
        .trim()
    )
    .map(cleanText)
    .filter((line) => line.length > 0 && !isTableOrFormatting(line))
    .slice(0, 5);
}

/**
 * Wordings an LLM has used for each sentiment, checked in order.
 *
 * A table rather than a chain of `||`: the order is the precedence (a phrase
 * carrying both positive and negative wording resolves positive, as before), and
 * a new synonym becomes a row instead of another `||`.
 */
const SENTIMENT_SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['positive', ['积极', '正面', 'positive']],
  ['negative', ['消极', '负面', 'negative']],
];

/**
 * Map the wording an LLM used for sentiment onto the three stored values.
 *
 * Anything unrecognised is neutral rather than a guess, so a novel phrasing does
 * not silently become a positive review.
 */
function normaliseSentiment(raw: string): string {
  const value = raw.trim().toLowerCase();
  const match = SENTIMENT_SYNONYMS.find(([, words]) => words.some((w) => value.includes(w)));
  return match ? match[0] : 'neutral';
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
    return createEmptyDimensionReport(interviewId);
  }
}

/** One dimension the analysis attached to the interview. */
type DimensionTag = NonNullable<ReportWithDimensions['dimensionTags']>[number];

/** The empty dimension report, shared by every bail-out path. */
const EMPTY_DIMENSION_TAGS = { dimensionTags: [] as DimensionTag[], emergentTags: [] as string[] };

/** Parse the model's JSON, tolerating the fences it likes to wrap it in. */
function parseJsonBlock(content: string): unknown {
  return JSON.parse(
    content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
  );
}

/** Read an array field, defaulting to empty when the model omitted or mistyped it. */
function arrayField<T>(source: Record<string, unknown>, key: string): T[] {
  const value = source[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseDimensionAnalysis(
  content: string
): Pick<ReportWithDimensions, 'dimensionTags' | 'emergentTags' | 'interviewerRating'> {
  let parsed: unknown;
  try {
    parsed = parseJsonBlock(content);
  } catch {
    return { ...EMPTY_DIMENSION_TAGS };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_DIMENSION_TAGS };

  const source = parsed as Record<string, unknown>;
  const rating = source['interviewerRating'];
  return {
    dimensionTags: arrayField<DimensionTag>(source, 'dimensionTags'),
    emergentTags: arrayField<string>(source, 'emergentTags'),
    // Omitted rather than set to undefined: the field is optional and an
    // explicit `undefined` would survive a spread into the stored report.
    ...(typeof rating === 'number' ? { interviewerRating: rating } : {}),
  };
}
