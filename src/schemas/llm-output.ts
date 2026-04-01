import { z } from "zod";

const DANGEROUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /you\s+are\s+now\s+(in\s+)?developer\s+mode/i,
  /system\s+override/i,
  /reveal\s+(system\s+)?prompt/i,
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /data:text\/html/gi,
  /on\w+\s*=/gi,
];

function sanitizeContent(content: string): string {
  let sanitized = content;

  DANGEROUS_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  });

  sanitized = sanitized.replace(/\s+/g, " ").trim();
  // eslint-disable-next-line no-control-regex -- Intentionally stripping control chars for security (prevents injection attacks)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

export const SanitizedContentSchema = z
  .string()
  .min(1, "Content cannot be empty")
  .max(10000, "Content exceeds maximum length")
  .transform((val) => sanitizeContent(val));

export const ValidatedLLMResponseSchema = z.object({
  content: SanitizedContentSchema,
  isFollowupNeeded: z.boolean().default(false),
  followupQuestion: z
    .string()
    .max(500, "Follow-up question too long")
    .optional()
    .transform((val) => (val ? sanitizeContent(val) : val)),
});

export type ValidatedLLMResponse = z.infer<typeof ValidatedLLMResponseSchema>;

export function safeValidateLLMResponse(
  data: unknown,
): ValidatedLLMResponse | null {
  const result = ValidatedLLMResponseSchema.safeParse(data);
  return result.success ? result.data : null;
}
