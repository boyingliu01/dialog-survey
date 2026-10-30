/**
 * Issue #219 — the admin import dialog must advertise what the API actually
 * accepts, and the client-side commit filter must use the same importability
 * rule as the server.
 *
 * There are now three copies of that rule: the server's `IMPORTABLE_STATUSES`
 * set, the commit zod enum, and the Alpine `IMPORTABLE` array in the template.
 * They are compared against each other here, because a silent drift between
 * them is exactly the bug this sprint set out to fix (the old UI showed
 * `name_mismatch` rows as passing while the commit handler dropped them).
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const TEMPLATE = 'src/views/admin/content/plan-detail.njk';
const API = 'src/api/plans.ts';

async function readTemplate(): Promise<string> {
  return readFile(TEMPLATE, 'utf8');
}

async function readApi(): Promise<string> {
  return readFile(API, 'utf8');
}

describe('Bulk import UI copy (issue #219)', () => {
  /** @test REQ-USERID-006
   *  @intent the upload hint and file picker must match the endpoint's real
   *    capabilities, or admins never discover userId/JSON import.
   *  @covers AC-USERID-006-01
   */
  it('advertises userId and JSON, and accepts .json files', async () => {
    const template = await readTemplate();

    // Hint names the three supported columns and the JSON form.
    expect(template).toContain('userId');
    expect(template).toContain('CSV 或 JSON 文件');

    // The picker must not filter out a JSON upload before the API sees it.
    const acceptMatch = template.match(/accept="([^"]+)"/);
    expect(acceptMatch).not.toBeNull();
    expect(acceptMatch?.[1]).toContain('.csv');
    expect(acceptMatch?.[1]).toContain('.json');
  });

  /** @test REQ-USERID-006
   *  @intent a userId-only row has no phone number, so the preview table must
   *    never assume one is present when rendering.
   *  @covers AC-USERID-006-01
   */
  it('renders rows without a phone number', async () => {
    const template = await readTemplate();
    // Every phone cell falls back to a placeholder instead of printing "undefined".
    expect(template).toMatch(/row\.phone \|\| '-'/);
    // The passed list shows the userId column, which is the identifier here.
    expect(template).toContain("row.userId || '-'");
  });

  /** @test REQ-USERID-006
   *  @intent the client must submit `name_differs` rows; filtering on 'ok' only
   *    silently dropped every warned row (fixed here).
   *  @covers AC-USERID-006-02
   */
  it('commits name_differs rows instead of filtering on ok only', async () => {
    const template = await readTemplate();

    // The old, buggy filter — must be gone.
    expect(template).not.toContain("filter(r => r.status === 'ok')");

    // The commit filter now goes through the shared importability helper.
    const commit = template.slice(template.indexOf('const rows = importResults.results.filter'));
    expect(commit).toContain('isImportable(r)');
  });

  /** @test REQ-USERID-006
   *  @intent the template's importability list must equal the server's, or the
   *    UI will offer to commit rows the API then rejects (or vice versa).
   *  @covers AC-USERID-006-02
   */
  it('uses the same importable statuses as the server', async () => {
    const [template, api] = await Promise.all([readTemplate(), readApi()]);

    const uiList = template.match(/IMPORTABLE: \[([^\]]+)\]/);
    expect(uiList).not.toBeNull();
    const uiStatuses = (uiList?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();

    // The declaration spans lines (new Set<ImportStatus>([ ... ])), so the
    // bracketed body has to be matched across newlines.
    const serverSet = api.match(
      /IMPORTABLE_STATUSES[^=]*=\s*new Set<ImportStatus>\(\[([\s\S]*?)\]\)/
    );
    expect(serverSet).not.toBeNull();
    const serverStatuses = (serverSet?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();

    const commitEnum = api.match(/status: z\.enum\(\[([^\]]+)\]\)/);
    expect(commitEnum).not.toBeNull();
    const enumStatuses = (commitEnum?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();

    expect(uiStatuses).toEqual(serverStatuses);
    expect(enumStatuses).toEqual(serverStatuses);
  });
});
