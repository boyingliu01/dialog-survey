export interface DimensionStat {
  dimensionId: string;
  label: string;
  mentionRate: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
  totalMentions: number;
}

export interface DimensionStats {
  dimensions: DimensionStat[];
  totalInterviews: number;
}

export interface Checkpoint {
  completedStep: number;
  dimensionStats?: Record<string, DimensionStat>;
  topics?: Record<string, unknown>;
  emergents?: unknown[];
}

export function shouldSkipStep(
  checkpoint: Checkpoint | null | undefined,
  currentStep: number
): boolean {
  if (!checkpoint) return false;
  return checkpoint.completedStep >= currentStep;
}

export function createCheckpoint(step: number, data?: Record<string, unknown>): Checkpoint {
  return {
    completedStep: step,
    ...data,
  };
}

type DimensionEntry = {
  dimensionId: string;
  label: string;
  sentiment: string;
  quotes: string[];
};

function collectDimensionSentiments(
  dimensionTags: DimensionEntry[][]
): Map<string, { label: string; sentiments: string[] }> {
  const dimensionMap = new Map<string, { label: string; sentiments: string[] }>();

  for (const tags of dimensionTags) {
    const seenDimensions = new Set<string>();
    for (const tag of tags) {
      if (!seenDimensions.has(tag.dimensionId)) {
        seenDimensions.add(tag.dimensionId);
        if (!dimensionMap.has(tag.dimensionId)) {
          dimensionMap.set(tag.dimensionId, {
            label: tag.label,
            sentiments: [],
          });
        }
        const entry = dimensionMap.get(tag.dimensionId);
        if (entry) {
          entry.sentiments.push(tag.sentiment);
        }
      }
    }
  }

  return dimensionMap;
}

function countSentiments(sentiments: string[], target: string): number {
  let count = 0;
  for (const s of sentiments) {
    if (s === target) count++;
  }
  return count;
}

function buildDimensionStat(
  dimensionId: string,
  data: { label: string; sentiments: string[] },
  totalInterviews: number
): DimensionStat {
  const mentionCount = data.sentiments.length;
  const positive = countSentiments(data.sentiments, 'positive');
  const negative = countSentiments(data.sentiments, 'negative');
  const neutral = countSentiments(data.sentiments, 'neutral');

  return {
    dimensionId,
    label: data.label,
    mentionRate: totalInterviews > 0 ? mentionCount / totalInterviews : 0,
    sentimentBreakdown: {
      positive: mentionCount > 0 ? positive / mentionCount : 0,
      negative: mentionCount > 0 ? negative / mentionCount : 0,
      neutral: mentionCount > 0 ? neutral / mentionCount : 0,
    },
    totalMentions: mentionCount,
  };
}

export function computeDimensionStats(
  dimensionTags: DimensionEntry[][],
  totalInterviews: number
): DimensionStats {
  const dimensionMap = collectDimensionSentiments(dimensionTags);

  const dimensions: DimensionStat[] = [];
  for (const [dimensionId, data] of dimensionMap) {
    dimensions.push(buildDimensionStat(dimensionId, data, totalInterviews));
  }

  dimensions.sort((a, b) => b.mentionRate - a.mentionRate);

  return { dimensions, totalInterviews };
}

export async function executeWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const { default: pLimit } = await import('p-limit');
  const limiter = pLimit(limit);
  const jobs = tasks.map((task) => limiter(task));
  return Promise.all(jobs);
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function runWithTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Pipeline timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    task()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
