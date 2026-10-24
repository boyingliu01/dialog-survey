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

/** Questions submitted as a keyed object (`questions: { 0: { text } }`). */
function extractStructuredQuestions(questionsObj: Record<string, { text: string }>): string[] {
  const questions: string[] = [];
  for (const key of Object.keys(questionsObj).sort()) {
    const q = questionsObj[key];
    if (q && typeof q === 'object' && typeof q.text === 'string') {
      const trimmed = q.text.trim();
      if (trimmed) questions.push(trimmed);
    }
  }
  return questions;
}

/** Questions submitted as flat `questions[i][text]` form fields. */
function extractFlatFormQuestions(body: Record<string, unknown>): string[] {
  const questions: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    const match = key.match(/^questions\[(\d+)\]\[text\]$/);
    if (match && typeof value === 'string') {
      const index = Number.parseInt(match[1], 10);
      const trimmed = value.trim();
      if (trimmed) {
        questions[index] = trimmed;
      }
    }
  }
  return questions.filter((q): q is string => q !== undefined);
}

function buildDefaultContent(body: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {
    invitationPrompt: String(body['invitationPrompt'] || ''),
    questions: [],
  };

  if (body['closingMessage']) content['closingMessage'] = body['closingMessage'];
  if (body['llmPromptTemplate']) content['llmPromptTemplate'] = body['llmPromptTemplate'];

  const questionsObj = body['questions'] as Record<string, { text: string }> | undefined;
  if (questionsObj && typeof questionsObj === 'object') {
    content['questions'] = extractStructuredQuestions(questionsObj);
  } else {
    content['questions'] = extractFlatFormQuestions(body);
  }

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
  const name = optionalTrimmed(parsed['name']);
  if (!name) return { error: 'JSON 缺少 name 字段' };

  const content = parsed['content'] as Record<string, unknown> | undefined;
  if (!content || typeof content !== 'object') return { error: 'JSON 缺少 content 字段' };

  const validationError = validateTemplateContent(content);
  if (validationError) return { error: validationError };

  const description = optionalTrimmed(parsed['description']);
  const input: { name: string; description?: string; content: Record<string, unknown> } = {
    name,
    content,
  };
  if (description) input.description = description;

  const dimensions = parsed['dimensions'] as
    | Array<{ id: string; label: string; keywords?: string[] }>
    | undefined;
  if (!Array.isArray(dimensions) || dimensions.length === 0) return { input };

  return { input, dimensions };
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
  if (e instanceof z.ZodError) {
    return { status: 422, body: htmlError(e.issues[0]?.message ?? 'Validation failed') };
  }
  if (isStaleRecordError(e)) {
    return { status: 409, body: '<div class="text-red-600">模板已被他人修改，请刷新后重试</div>' };
  }
  if (e instanceof Error && e.message.includes('find')) {
    return { status: 404, body: htmlError('Template not found') };
  }
  const errMsg = e instanceof Error ? e.message : 'Failed to update template';
  return { status: 500, body: htmlError(errMsg) };
}
