#!/usr/bin/env node
/**
 * Fail the build when the CJK font is a Git LFS pointer instead of a font.
 *
 * `assets/fonts/*.otf` is a Git LFS object (`.gitattributes`). Any clone that
 * did not run `git lfs pull` — CI without `lfs: true`, a `git archive`, a
 * shallow automation checkout, an operator following the README — receives a
 * 133-byte text file:
 *
 *   version https://git-lfs.github.com/spec/v1
 *   oid sha256:51792f6...
 *   size 16437340
 *
 * That file EXISTS, at the RIGHT PATH, with the RIGHT EXTENSION, so every
 * "is the font there?" check passes: the image builds, the service starts, and
 * every exported PDF renders Chinese as blank boxes (issue #217). The failure
 * the product ships is the one nobody sees — a respondent gets a PDF with no
 * readable text.
 *
 * So this validates the bytes, not the path:
 *   - rejects an LFS pointer by content, with the command that fixes it;
 *   - requires an OpenType (`OTTO`) or TrueType (`0x00010000`) magic number, so
 *     any other placeholder fails too;
 *   - rejects an implausibly small file, catching truncation.
 *
 * Usage: node scripts/verify-font-asset.mjs [path]
 * Exit:  0 = a real font, 1 = pointer / not a font / unreadable / too small.
 */
import { open, stat } from 'node:fs/promises';

/** The bundled CJK font is ~16 MB; anything under 1 MB is truncated or a stub. */
const MIN_FONT_BYTES = 1024 * 1024;

const LFS_POINTER_MAGIC = 'version https://git-lfs.github.com/spec/v1';

/** OpenType (`OTTO`), TrueType (`0x00010000`), Apple TrueType (`true`), TTC (`ttcf`). */
const FONT_MAGICS = [
  Buffer.from([0x4f, 0x54, 0x54, 0x4f]),
  Buffer.from([0x00, 0x01, 0x00, 0x00]),
  Buffer.from('true', 'ascii'),
  Buffer.from('ttcf', 'ascii'),
];

const target = process.argv[2] ?? 'assets/fonts/NotoSansCJKsc-Regular.otf';

function fail(reason, hint) {
  process.stderr.write(`\n[verify-font-asset] FAILED: ${reason}\n`);
  if (hint) process.stderr.write(`${hint}\n`);
  process.stderr.write('\n');
  process.exit(1);
}

const info = await stat(target).catch(() => null);
if (!info || !info.isFile()) {
  fail(
    `${target} is missing`,
    'The CJK font did not make it into the build context. Check .dockerignore\n' +
      '(`assets/` must not be excluded) and that the checkout contains the file.'
  );
}

if (info.size > 0 && info.size < MIN_FONT_BYTES) {
  // Read the head before judging: an LFS pointer is ~130 bytes but a truncated
  // real font would also be small, and the two need different advice.
  const probe = Buffer.alloc(Math.min(200, info.size));
  const handle = await open(target, 'r');
  try {
    await handle.read(probe, 0, probe.length, 0);
  } finally {
    await handle.close();
  }
  const text = probe.toString('utf8');

  if (text.startsWith(LFS_POINTER_MAGIC)) {
    fail(
      `${target} is a Git LFS pointer (${info.size} bytes), not a font`,
      'Fetch the real object, then rebuild:\n' +
        '  git lfs install && git lfs pull\n' +
        'CI: set `lfs: true` on actions/checkout. Without this the image builds\n' +
        'and runs, and every exported PDF silently renders Chinese as blank boxes.'
    );
  }

  fail(
    `${target} is only ${info.size} bytes — too small to be a CJK font`,
    'The file is truncated or a placeholder. Re-fetch it with `git lfs pull`.'
  );
}

const head = Buffer.alloc(4);
const handle = await open(target, 'r');
try {
  await handle.read(head, 0, 4, 0);
} finally {
  await handle.close();
}

const isFont = FONT_MAGICS.some((magic) => head.equals(magic));
if (!isFont) {
  fail(
    `${target} does not start with an OpenType/TrueType magic number (got ${head.toString('hex')})`,
    'The file is not a font. Re-fetch it with `git lfs pull` and rebuild.'
  );
}

process.stdout.write(
  `[verify-font-asset] OK: ${target} (${(info.size / 1024 / 1024).toFixed(1)} MB, magic ${head.toString('hex')})\n`
);
