import { z } from 'zod';

export const dimensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  keywords: z.array(z.string()).default([]),
});

export const dimensionsArraySchema = z.array(dimensionSchema);

export const analysisConfigSchema = z.object({
  emergentThreshold: z.number().int().min(1).optional(),
  customSentimentWords: z
    .object({
      positive: z.array(z.string()).default([]),
      negative: z.array(z.string()).default([]),
    })
    .optional(),
});

export const dimensionTagSchema = z.object({
  dimensionId: z.string().min(1),
  label: z.string().min(1),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  quotes: z.array(z.string()).default([]),
});

export const dimensionTagsArraySchema = z.array(dimensionTagSchema);

export function validateDimensions(input: string | null) {
  if (input === null || input === '') {
    return { success: true as const, data: [] };
  }
  try {
    const parsed = JSON.parse(input);
    return dimensionsArraySchema.safeParse(parsed);
  } catch {
    return { success: false as const, error: new z.ZodError([]) };
  }
}

export function validateDimensionTags(
  input:
    | string
    | {
        dimensionId: string;
        label: string;
        sentiment: string;
        quotes: string[];
      }[]
    | null
) {
  if (input === null) {
    return { success: true as const, data: [] };
  }
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  return dimensionTagsArraySchema.safeParse(raw);
}
