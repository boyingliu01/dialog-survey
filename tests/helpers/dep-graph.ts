// @no-test-required: covered directly by tests/architecture-dependency-graph.test.ts -- the four
// describes there drive findCycles with synthetic cyclic AND acyclic graphs, and stripComments /
// buildGraph / collectSources with inline sources. The file is not named dep-graph.test.ts because
// its subject is the architecture assertion, not the helper; every export has an assertion there.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * src/ 依赖图解析与环检测 —— 从 architecture-dependency-graph.test.ts 里提取出来的。
 *
 * 提取的原因有两个，都不是洁癖：
 *
 * 1. **它是算法，不是断言。** Tarjan 强连通分量本来就嵌在测试文件里，等于把一份
 *    生产算法放进了测试目录。biome 的 `noExportsInTest` 恰好点到了这个问题。
 * 2. **它之前是测不到的。** 原来的断言只有「当前仓库无环」，于是在当前无环的仓库上
 *    把 `if (component.length > 1)` 改成 `if (false)`（彻底关掉环检测）**全部测试
 *    依然通过** —— 那证明的是「此刻没有环」，不是「这个函数能发现环」。移进 helper
 *    之后 `tests/architecture-dependency-graph.test.ts` 用合成的有环图直接驱动它，
 *    检测器被阉割就必然失败。
 *
 * 这里刻意不复用 archlint：被测的正是「另一个工具报出来的东西是否可信」。用同一个
 * 工具的结论去验证它自己，等于没验。依赖图解析、环检测全部独立实现。
 */

export interface Graph {
  readonly nodes: readonly string[];
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

/** 收集 src/ 下所有 .ts 文件，跳过生成物与 node_modules。 */
export function collectSources(root: string): string[] {
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
export function resolveSpecifier(fromFile: string, specifier: string): string | null {
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
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function buildGraph(files: readonly string[]): Graph {
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
export function findCycles(graph: Graph): string[][] {
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
