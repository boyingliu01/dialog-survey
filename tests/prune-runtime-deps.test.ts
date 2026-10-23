/**
 * @test issue #210
 * @intent 部署树瘦身脚本（scripts/prune-runtime-deps.mjs）的契约：
 *   1. 只保留 dist/ 实际 import 的运行时依赖闭包；
 *   2. devOptional 链（prisma CLI → @prisma/dev / studio-core / effect）必须被移除；
 *   3. 保留包的依赖必须仍可解析，否则脚本以非 0 退出（宁可失败也不发布残缺树）；
 *   4. 缺少 dist/ 时拒绝猜测。
 *
 * 用真实临时目录 + 手工构造的迷你 node_modules 结构验证，不依赖真实 npm 安装。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts', 'prune-runtime-deps.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runPrune(dir: string, ...extra: string[]): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--dir', dir, ...extra], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** Write `<nodeModulesDir>/<name>/package.json`. */
function writePkg(nodeModulesDir: string, name: string, manifest: Record<string, unknown>): void {
  const dir = join(nodeModulesDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest }));
  writeFileSync(join(dir, 'index.js'), 'module.exports = {};');
}

describe('scripts/prune-runtime-deps.mjs (issue #210)', () => {
  let dir: string;
  let nodeModules: string;

  beforeEach(() => {
    dir = join(tmpdir(), `prune-deps-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    nodeModules = join(dir, 'node_modules');
    mkdirSync(nodeModules, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** dist/ that imports exactly `specifiers`. */
  function writeDist(...specifiers: string[]): void {
    const distDir = join(dir, 'dist', 'src');
    mkdirSync(distDir, { recursive: true });
    const lines = specifiers.map((s, i) => `import { a${i} } from '${s}';`).join('\n');
    writeFileSync(join(distDir, 'app.js'), `${lines}\nexport const ok = true;\n`);
  }

  it('keeps the runtime closure and removes everything unreachable', () => {
    writeDist('fastify', '@prisma/client');
    writePkg(nodeModules, 'fastify', { dependencies: { dep: '^1' } });
    writePkg(nodeModules, 'dep', {});
    writePkg(nodeModules, '@prisma/client', {
      name: '@prisma/client',
      dependencies: { '@prisma/client-runtime-utils': '1.0.0' },
      // The real trigger: prisma and typescript are OPTIONAL peers, so they are
      // not part of the runtime closure.
      peerDependencies: { prisma: '*', typescript: '>=5' },
      peerDependenciesMeta: { prisma: { optional: true }, typescript: { optional: true } },
    });
    writePkg(nodeModules, '@prisma/client-runtime-utils', {});
    // The devOptional chain that must disappear.
    writePkg(nodeModules, 'prisma', { dependencies: { '@prisma/dev': '1.0.0' } });
    writePkg(nodeModules, '@prisma/dev', { dependencies: { effect: '1.0.0' } });
    writePkg(nodeModules, 'effect', {});
    writePkg(nodeModules, 'typescript', {});

    const result = runPrune(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('verified');
    // Kept
    for (const kept of ['fastify', 'dep', '@prisma/client', '@prisma/client-runtime-utils']) {
      expect(() =>
        execFileSync(process.execPath, ['-e', `require.resolve('${kept}/package.json')`], {
          cwd: dir,
          stdio: 'ignore',
        })
      ).not.toThrow();
    }
    // Pruned
    expect(result.stdout).toMatch(/removed \d+ package/);
    for (const gone of ['prisma', '@prisma/dev', 'effect', 'typescript']) {
      expect(result.stdout).toContain(gone);
    }
  });

  it('removes devOptional packages even though @prisma/client lists them as peers', () => {
    writeDist('@prisma/client');
    writePkg(nodeModules, '@prisma/client', {
      name: '@prisma/client',
      peerDependencies: { prisma: '*', typescript: '>=5.4.0' },
      peerDependenciesMeta: { prisma: { optional: true }, typescript: { optional: true } },
    });
    writePkg(nodeModules, 'prisma', {});
    writePkg(nodeModules, 'typescript', {});

    const result = runPrune(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('prisma');
    expect(result.stdout).toContain('typescript');
  });

  it('resolves nested node_modules like Node does instead of pruning a needed dep', () => {
    // path-scurry has a nested lru-cache of a different version; a naive
    // top-level-only walk reports it as dangling and fails the run.
    writeDist('path-scurry');
    writePkg(nodeModules, 'path-scurry', { dependencies: { 'lru-cache': '^11' } });
    writePkg(nodeModules, 'path-scurry/node_modules/lru-cache', {});

    const result = runPrune(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('verified');
  });

  it('refuses to guess when dist/ is missing', () => {
    writePkg(nodeModules, 'fastify', {});

    const result = runPrune(dir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('no dist/');
  });

  it('--dry-run reports but does not delete', () => {
    writeDist('fastify');
    writePkg(nodeModules, 'fastify', {});
    writePkg(nodeModules, 'typescript', {});

    const result = runPrune(dir, '--dry-run');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('would remove');
    // typescript must still be on disk
    expect(() =>
      execFileSync(process.execPath, ['-e', "require.resolve('typescript/package.json')"], {
        cwd: dir,
        stdio: 'ignore',
      })
    ).not.toThrow();
  });

  it('leaves an already-minimal tree untouched', () => {
    writeDist('fastify');
    writePkg(nodeModules, 'fastify', {});

    const result = runPrune(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing to remove');
  });
});
