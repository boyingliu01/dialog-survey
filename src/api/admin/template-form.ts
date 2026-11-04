// @no-test-required: covered by tests/admin-templates-import.test.ts and tests/admin-error-branches.test.ts
import { z } from 'zod';
import { htmlError } from './html.js';

/**
 * Schemas and form-body normalisation for the template write endpoints.
 *
 * The admin UI submits either a JSON `content` object (the programmatic form) or
 * flat `questions[0][text]` fields (the rendered form), so the two shapes are
 * collapsed into one here rather than in each handler.
 */

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().or(z.undefined()),
  content: z.object({}).passthrough(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().or(z.undefined()),
  content: z.object({}).passthrough(),
});

export const versionSchema = z.object({ version: z.coerce.number().int().positive() });

/** Content fields copied through only when the form supplied them. */
const OPTIONAL_CONTENT_FIELDS = ['closingMessage', 'llmPromptTemplate'] as const;

/**
 * The questions from whichever shape the body uses.
 *
 * The rendered form sends flat `questions[0][text]` fields; the JSON API sends a
 * keyed object. Both collapse to the same array, and the object shape wins when
 * present because that is the one the API documents.
 */
function questionsFromBody(body: Record<string, unknown>): string[] {
  const questionsObj = body['questions'];
  if (questionsObj && typeof questionsObj === 'object') {
    return extractStructuredQuestions(questionsObj as Record<string, { text: string }>);
  }
  return extractFlatFormQuestions(body);
}

/** Questions submitted as a keyed object (`questions: { 0: { text } }`). */
function extractStructuredQuestions(questionsObj: Record<string, { text: string }>): string[] {
  const questions: string[] = [];
  // Sorted by KEY, not by the numeric value: the keys are stringified indices and
  // a plain Object.keys order would put "10" before "2".
  for (const key of Object.keys(questionsObj).sort()) {
    const text = questionTextOf(questionsObj[key]);
    if (text) questions.push(text);
  }
  return questions;
}

/**
 * The question text carried by one submitted entry, trimmed, or ''.
 *
 * Accepts anything object-like because the body is user-controlled: the rendered
 * form sends `{ text }`, but an empty slot arrives as `{}` and must simply be
 * skipped rather than crash the import.
 */
function questionTextOf(entry: unknown): string {
  const obj = asRecord(entry);
  if (!obj) return '';
  const text = obj['text'];
  return typeof text === 'string' ? text.trim() : '';
}

/** The value as an object, or null when it is not object-like. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

/** Questions submitted as flat `questions[i][text]` form fields. */
function extractFlatFormQuestions(body: Record<string, unknown>): string[] {
  const questions: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    const index = flatQuestionIndex(key);
    if (index === null || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) questions[index] = trimmed;
  }
  // Sparse: a blank slot leaves a hole, and a hole must not become a question.
  return questions.filter((q): q is string => q !== undefined);
}

/** The array index encoded in a `questions[i][text]` field name, or null. */
function flatQuestionIndex(key: string): number | null {
  const match = key.match(/^questions\[(\d+)\]\[text\]$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function buildDefaultContent(body: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {
    invitationPrompt: String(body['invitationPrompt'] || ''),
    questions: [],
  };

  for (const key of OPTIONAL_CONTENT_FIELDS) {
    if (body[key]) content[key] = body[key];
  }
  content['questions'] = questionsFromBody(body);

  return content;
}

/** Take the template content from the submitted body, whichever shape it has. */
export function buildContentFromForm(body: Record<string, unknown>): Record<string, unknown> {
  if (body['content'] && typeof body['content'] === 'object' && !Array.isArray(body['content'])) {
    return body['content'] as Record<string, unknown>;
  }
  return buildDefaultContent(body);
}

/** Reject an empty template: the form must carry at least one question and a prompt. */
export function validateTemplateContent(content: Record<string, unknown>): string | null {
  const questions = content['questions'] as string[] | undefined;
  if (!questions || questions.length === 0) {
    return '请至少添加一个问题';
  }
  const invitationPrompt = content['invitationPrompt'] as string | undefined;
  if (!invitationPrompt || !invitationPrompt.trim()) {
    return '请填写邀约提示词';
  }
  return null;
}

/** Result of validating a pasted template JSON document. */
export type TemplateImportResult =
  | { error: string }
  | {
      input: { name: string; description?: string; content: Record<string, unknown> };
      dimensions?: Array<{ id: string; label: string; keywords?: string[] }>;
    };

/**
 * Read an optional string field, trimmed, or undefined when absent/blank.
 *
 * Avoids the `x != null ? x.trim() : undefined` ternary that pushed the import
 * validator over the complexity threshold.
 */
function optionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Validate an already-parsed import document. */
function validateImportedTemplate(parsed: Record<string, unknown>): TemplateImportResult {
  const shape = importShapeProblem(parsed);
  if (typeof shape === 'string') return { error: shape };

  const input = importInputOf(parsed, shape);
  const dimensions = usableDimensions(parsed['dimensions']);
  return dimensions ? { input, dimensions } : { input };
}

/**
 * The first reason the pasted document is not a template, or the pieces needed
 * to build one.
 *
 * Ordered so the user gets the most actionable message first: a wrong NAME field
 * is a typo they can see, while a bad content body needs the content rules run.
 */
function importShapeProblem(parsed: Record<string, unknown>): string | ImportShape {
  const name = optionalTrimmed(parsed['name']);
  if (!name) return 'JSON 缺少 name 字段';

  const content = parsed['content'];
  if (!content || typeof content !== 'object') return 'JSON 缺少 content 字段';

  const contentError = validateTemplateContent(content as Record<string, unknown>);
  if (contentError) return contentError;

  return { name, content: content as Record<string, unknown> };
}

/** A validated import document, before dimensions are considered. */
interface ImportShape {
  name: string;
  content: Record<string, unknown>;
}

/** The create input for a validated document, with description when supplied. */
function importInputOf(
  parsed: Record<string, unknown>,
  shape: ImportShape
): ImportShape & {
  description?: string;
} {
  const description = optionalTrimmed(parsed['description']);
  if (!description) return shape;
  return { ...shape, description };
}

/**
 * The dimensions carried by the document, or undefined.
 *
 * An absent or empty list is not an error -- a template with no dimensions is
 * legitimate -- but a non-empty one is passed through for the caller to persist.
 */
function usableDimensions(
  value: unknown
): Array<{ id: string; label: string; keywords?: string[] }> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value as Array<{ id: string; label: string; keywords?: string[] }>;
}

/**
 * Validate the JSON a user pasted into the template-import form.
 *
 * Returns `{ error }` with the message to show, or the normalised input ready
 * for `templateRepo.create`. Kept free of Fastify types so the rules can be
 * unit-tested without an HTTP round trip.
 */
export function prepareTemplateImport(raw: string | undefined): TemplateImportResult {
  if (!raw || !raw.trim()) return { error: '请粘贴模板 JSON 内容' };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: 'JSON 格式错误，请检查后重试' };
  }

  return validateImportedTemplate(parsed);
}

/** True when Prisma reports the row vanished or was concurrently modified. */
function isStaleRecordError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if ((e as unknown as { code?: string }).code === 'P2025') return true;
  return e.message.toLowerCase().includes('record');
}

/**
 * Map a template-update failure to the HTTP status and HTML fragment to return.
 *
 * The ordering matters: a ZodError is a 422, a Prisma "record not found"/P2025 is
 * a 409 (someone else changed the row), a missing lookup is a 404, and anything
 * else is a 500 with the original message surfaced for debugging.
 */
export function mapUpdateError(e: unknown): { status: number; body: string } {
  if (e instanceof z.ZodError) return validationFailure(e);
  if (isStaleRecordError(e)) return staleFailure();
  if (isLookupFailure(e)) return { status: 404, body: htmlError('Template not found') };
  return serverFailure(e);
}

/** 422 with the first Zod issue, which is the one the form highlights. */
function validationFailure(e: z.ZodError): { status: number; body: string } {
  return { status: 422, body: htmlError(e.issues[0]?.message ?? 'Validation failed') };
}

/** 409: another admin committed first, so the form is holding a stale version. */
function staleFailure(): { status: number; body: string } {
  return { status: 409, body: '<div class="text-red-600">模板已被他人修改，请刷新后重试</div>' };
}

/**
 * A thrown message mentioning `find`, which is this codebase's shape for a
 * failed lookup. Kept as a predicate so the ordering in `mapUpdateError` stays
 * readable.
 */
function isLookupFailure(e: unknown): boolean {
  return e instanceof Error && e.message.includes('find');
}

/** 500 with the original message surfaced, so the cause is visible in the UI. */
function serverFailure(e: unknown): { status: number; body: string } {
  const errMsg = e instanceof Error ? e.message : 'Failed to update template';
  return { status: 500, body: htmlError(errMsg) };
}
