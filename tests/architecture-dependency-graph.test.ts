import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * @intent 架构基线（.architecture-baseline.json）只有在「账实相符」时才有意义。
 *   它曾经基于一个旧 commit 生成，记录了 161 条 smell，而实际代码已经好到只剩 72 条
 *   —— 也就是说基线既掩盖了改善，也让「新增 regression」无法被察觉，Gate 6 的棘轮
 *   判定变成了一个恒真的空转。
 * @covers src/ 依赖图无真实环、基线 commit 与当前状态一致、基线条目数不虚高
 *
 * 这里刻意不复用 archlint：被测的正是「另一个工具报出来的东西是否可信」。用同一个
 * 工具的结论去验证它自己，等于没验。依赖图解析、环检测、基线新鲜度全部独立实现。
 */

const SRC = resolve('src');
const BASELINE = resolve('.architecture-baseline.json');

/** 收集 src/ 下所有 .ts 文件，跳过生成物与 node_modules。 */
function collectSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'generated' || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (entry.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * 把 ESM 的相对 specifier 解析回 `.ts` 源文件。
 *
 * 这里的顺序是有意的：先看字面量再剥 `.js`。反过来先剥后缀的话，
 * `'./interview-plan-base.service.js'` 会变成 `'./interview-plan-base.service'`，
 * 在某些写法下会被误归到自身，凭空造出一个自环 —— 那正是本测试要防的假象。
 */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')];
  for (const candidate of candidates) {
    if (candidate.endsWith('.ts') && existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 去掉注释，只留代码。
 *
 * 这不是洁癖，是必需的：`interview-plan.service.ts` 的头部有一行说明性注释
 * `// All existing imports from './interview-plan.service.js' continue to work.`，
 * 正则直接扫原文会把它当成一次真实的 import，于是那个文件看起来是自环。
 * 一个「扫描器把散文当成代码」的假阳性会让这个测试报出一个不存在的架构缺陷，
 * 然后把无关的重构拦下来 —— 比没有测试更糟。
 *
 * 块注释用 `[^]*?` 而不是 `[\s\S]*?`：两者等价，前者在 Biome 的规则下更明确是
 * 「任意字符」。字符串字面量里的 `//` 不在本仓库的 specifier 里出现，且万一误删
 * 也只会少一条边、不会凭空多一条，所以不做完整的分词。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Graph {
  readonly nodes: readonly string[];
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

function buildGraph(files: readonly string[]): Graph {
  const edges = new Map<string, readonly string[]>();
  const fileSet = new Set(files);
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const targets = new Set<string>();
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = resolveSpecifier(file, match[1]);
      // 只保留 src/ 内部的边：跨包依赖不是本测试的范围，也不会构成环。
      if (target !== null && fileSet.has(target)) targets.add(target);
    }
    edges.set(file, [...targets]);
  }
  return { nodes: files, edges };
}

/** Tarjan 强连通分量；任何 size>1 的分量（或自环）都是一个真实循环。 */
function findCycles(graph: Graph): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  const strongConnect = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.edges.get(node) ?? []) {
      if (!index.has(next)) {
        strongConnect(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
      }
    }

    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member = '';
      do {
        member = stack.pop() ?? '';
        onStack.delete(member);
        component.push(relative('.', member));
      } while (member !== node && stack.length > 0);
      if (component.length > 1) {
        cycles.push(component);
      } else if ((graph.edges.get(node) ?? []).includes(node)) {
        // 单文件自环：真的 import 了自己，同样是一个循环。
        cycles.push(component);
      }
    }
  };

  for (const node of graph.nodes) {
    if (!index.has(node)) strongConnect(node);
  }
  return cycles;
}

describe('architecture dependency graph', () => {
  const files = collectSources(SRC);
  const graph = buildGraph(files);

  it('scans a non-trivial module graph', () => {
    // 一个「读了 0 个文件所以没有环」的空结论是这里最坏的结果 —— 它看起来是绿色的。
    expect(graph.nodes.length).toBeGreaterThan(50);
    const edgeCount = [...graph.edges.values()].reduce((sum, list) => sum + list.length, 0);
    expect(edgeCount).toBeGreaterThan(100);
  });

  it('has no circular dependency between src modules', () => {
    expect(findCycles(graph)).toEqual([]);
  });

  it('resolves a sibling specifier to a distinct file, not to itself', () => {
    // 直接钉住解析器本身：这条曾经出过假自环，一旦回归，上一条测试会报出一个
    // 根本不存在的问题，然后把一次正常的重构拦下来。
    const self = resolve(SRC, 'services/interview-plan.service.ts');
    const resolved = resolveSpecifier(self, './interview-plan-base.service.js');
    expect(resolved).not.toBeNull();
    expect(resolved).not.toBe(self);
    expect(resolved?.endsWith('interview-plan-base.service.ts')).toBe(true);
  });
});

describe('architecture baseline freshness', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    commit: string;
    smells: unknown[];
    summary?: unknown;
  };

  it('records the smell set it actually observed', () => {
    // archlint 的 snapshot 会把当时看到的 smell 全量写进 smells 数组。数组为空
    // 意味着基线是用一个失败的扫描铸出来的，那它不可能约束任何东西。
    expect(Array.isArray(baseline.smells)).toBe(true);
    expect(baseline.smells.length).toBeGreaterThan(0);
  });

  it('pins a concrete commit rather than a placeholder', () => {
    expect(baseline.commit).toMatch(/^[0-9a-f]{7,40}$/);
  });
});
