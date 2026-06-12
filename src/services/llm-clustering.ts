import { type LLMService } from '../integrations/llm/base.js';

export interface SubTheme {
  subTopicName: string;
  mentionCount: number;
  overallSentiment: string;
  representativeQuotes: string[];
}

export interface EmergentIssue {
  name: string;
  mentionCount: number;
  urgency: 'high' | 'medium' | 'low';
  representativeQuotes: string[];
}

export async function clusterDimensionQuotes(
  quotes: string[],
  dimension: string,
  llm: LLMService
): Promise<SubTheme[]> {
  if (!quotes.length) return [];

  const prompt = `You are a qualitative research analyst.
Cluster the following ${quotes.length} user quotes about "${dimension}" into 3-8 sub-themes.

**Quotes**:
${quotes.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

**Task**:
1. Group similar quotes into 3-8 sub-themes
2. For each sub-theme: provide a name, count, overall sentiment (positive/negative/neutral), and 1-2 representative quotes

**Return JSON only**:
[{"subTopicName":"...","mentionCount":3,"overallSentiment":"positive|negative|neutral","representativeQuotes":["..."]}]`;

  try {
    const response = await llm.chat({
      model: process.env.LLM_MODEL || process.env.VOLCENGINE_MODEL || 'deepseek-v3.2',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const parsed = parseSubThemes(response.content);
    return parsed;
  } catch {
    return [];
  }
}

export async function discoverEmergentIssues(
  allEmergents: string[],
  llm: LLMService
): Promise<EmergentIssue[]> {
  if (!allEmergents.length) return [];

  const prompt = `You are a qualitative research analyst.
From the following user-emergent issue tags across multiple interviews, identify the top 5 most important issues.

**All emergent tags**:
${allEmergents.join('\n')}

**Task**:
1. Identify up to 5 most important issues
2. For each: provide name, estimated mention count, urgency (high/medium/low), and up to 3 representative examples

**Return JSON only**:
[{"name":"...","mentionCount":15,"urgency":"high|medium|low","representativeQuotes":["..."]}]`;

  try {
    const response = await llm.chat({
      model: process.env.LLM_MODEL || process.env.VOLCENGINE_MODEL || 'deepseek-v3.2',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const parsed = parseEmergentIssues(response.content);
    return parsed;
  } catch {
    return [];
  }
}

function parseSubThemes(content: string): SubTheme[] {
  try {
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length >= 3 && parsed.length <= 8) {
      return parsed as SubTheme[];
    }
    return [];
  } catch {
    return [];
  }
}

function parseEmergentIssues(content: string): EmergentIssue[] {
  try {
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 5) as EmergentIssue[];
    }
    return [];
  } catch {
    return [];
  }
}
