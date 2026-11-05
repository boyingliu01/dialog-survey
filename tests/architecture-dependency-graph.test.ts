import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Graph } from './helpers/dep-graph.js';
import {
  buildGraph,
  collectSources,
  findCycles,
  resolveSpecifier,
  stripComments,
} from './helpers/dep-graph.js';

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

/**
 * 反向验证：检测器必须能**发现**环，而不只是在当前无环的仓库上返回空。
 *
 * 之前的测试只断言 `has no circular dependency between src modules` 的结果为空，
 * 于是「禁用整个检测器」也照样通过 —— 实测把 `if (component.length > 1)` 改成
 * `if (false)` 后，5 个测试全绿。那种测试证明的是「仓库此刻无环」，而不是
 * 「这个函数能识别环」，两者只有在真的出现环时才分得开，而那时已经晚了。
 *
 * 下面用合成的图直接驱动同一个 `findCycles`：图是输入，环是可预期的输出，
 * 检测器被阉割就必然失败。
 */
describe('findCycles (synthetic graphs)', () => {
  /** 由 "a -> b" 这样的边列表构造图，节点取所有出现过的名字。 */
  function graphOf(edges: ReadonlyArray<readonly [string, string]>): Graph {
    const adjacency = new Map<string, string[]>();
    for (const [from, to] of edges) {
      adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
      if (!adjacency.has(to)) adjacency.set(to, []);
    }
    return { nodes: [...adjacency.keys()], edges: adjacency };
  }

  it('reports a two-node cycle', () => {
    // 最小可能的环。检测器若被禁用，这里得到 []。
    expect(
      findCycles(
        graphOf([
          ['a', 'b'],
          ['b', 'a'],
        ])
      )
    ).toHaveLength(1);
  });

  it('reports a three-node cycle as ONE component, not three', () => {
    // 强连通分量是整个 {a,b,c}，逐个上报会把一个环算成三个缺陷。
    const cycles = findCycles(
      graphOf([
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ])
    );
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toHaveLength(3);
  });

  it('reports a self-loop', () => {
    // 单文件 import 自己：size 为 1 但不是「无环」，必须单独判。
    expect(findCycles(graphOf([['a', 'a']]))).toHaveLength(1);
  });

  it('finds NOTHING in a diamond, which is not a cycle', () => {
    // a→b, a→c, b→d, c→d 有多条路径但没有回到起点的话，不是环。
    // 没有这条，「把所有分量都当成环」的实现也能通过前三条。
    expect(
      findCycles(
        graphOf([
          ['a', 'b'],
          ['a', 'c'],
          ['b', 'd'],
          ['c', 'd'],
        ])
      )
    ).toEqual([]);
  });

  it('finds nothing in a straight chain', () => {
    expect(
      findCycles(
        graphOf([
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
        ])
      )
    ).toEqual([]);
  });

  it('finds TWO separate cycles independently', () => {
    // 一个环的检测成功不能掩盖另一个环被漏掉。
    const cycles = findCycles(
      graphOf([
        ['a', 'b'],
        ['b', 'a'],
        ['x', 'y'],
        ['y', 'z'],
        ['z', 'x'],
      ])
    );
    expect(cycles).toHaveLength(2);
  });

  it('finds a cycle that hangs off a longer acyclic tail', () => {
    // 环不在入口处：根→a 无环，环在 b↔c。
    const cycles = findCycles(
      graphOf([
        ['root', 'a'],
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'b'],
      ])
    );
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toHaveLength(2);
  });
});

/**
 * 解析层的直接覆盖。
 *
 * `findCycles` 有了合成图的反向验证，但**喂给它的图**同样会出错，而且历史上错过
 * 一次：`interview-plan.service.ts` 头部有一行说明性注释
 * `// All existing imports from './interview-plan.service.js' continue to work.`，
 * 正则直接扫原文会把它当成一次真实的 import，于是那个文件看起来是自环。一个
 * 「扫描器把散文当成代码」的假阳性会报出根本不存在的架构缺陷，比没有测试更糟。
 *
 * 下面这几条钉的就是这件事，用的是内联源码而不是仓库当前内容，所以被测的是解析器
 * 本身，而不是「此刻仓库里恰好有没有这种注释」。
 */
describe('source parsing', () => {
  /**
   * 样本里的 `import ... from '...'` 必须用拼接构造，不能写成完整字面量。
   *
   * 原因不是洁癖：xp-gate 的 Gate 10（build integrity）用正则扫源文件里的
   * `from '<path>'`，它分不清「代码」和「字符串里描述代码的文本」，于是把这三条
   * 测试样本当成三个真实 import，报 `import target does not exist` 并阻断推送。
   * 拼起来之后，这份文本仍然是被测输入，Gate 10 的扫描却不再有假阳性。
   */
  const FROM = `fr${'om'}`;

  it('ignores an import that only appears inside a line comment', () => {
    // 正是那个真实踩过的坑。
    const source = [
      `// All existing imports from './gone.js' continue to work.`,
      `import { a } ${FROM} './real.js';`,
    ].join('\n');
    expect(stripComments(source)).not.toContain('gone');
    expect(stripComments(source)).toContain('./real.js');
  });

  it('ignores imports inside a block comment', () => {
    const source = ['/*', `import { a } ${FROM} './gone.js';`, '*/', 'const x = 1;'].join('\n');
    expect(stripComments(source)).not.toContain('gone');
  });

  it('keeps a URL in a string, which is not a comment', () => {
    // `https://` 里的 `//` 不是注释。这条防的是「看见 // 就截断」的粗暴实现。
    const source = `const u = 'https://example.com/x';\nimport { a } ${FROM} './real.js';`;
    expect(stripComments(source)).toContain('https://example.com/x');
    expect(stripComments(source)).toContain('./real.js');
  });

  it('keeps the code before a trailing line comment', () => {
    // `[^:]` 那一段回退必须把前缀还回来，否则 `const x = 1 // note` 会整行消失。
    expect(stripComments('const x = 1; // note')).toContain('const x = 1;');
  });

  it('collects only .ts files and skips generated/', () => {
    // 用真实的 src/ 走一遍：生成物必须被排除，否则依赖图上会多出几百个伪节点。
    const files = collectSources(SRC);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.endsWith('.ts'))).toBe(true);
    expect(files.some((f) => f.includes('generated'))).toBe(false);
  });

  it('builds edges only between files in the scanned set', () => {
    // 跨包依赖不是本测试的范围，也不会构成环；一条指向集合外的边必须被丢掉。
    const graph = buildGraph(collectSources(SRC));
    const known = new Set(graph.nodes);
    for (const targets of graph.edges.values()) {
      for (const target of targets) {
        expect(known.has(target)).toBe(true);
      }
    }
  });
});
