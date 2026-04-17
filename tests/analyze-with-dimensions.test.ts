import { describe, expect, it } from 'vitest';

/**
 * @test REQ-SINGLE-002
 * @intent verify prompt.service.ts renders analyzeWithDimensions prompt with dimensions
 * @covers AC-SINGLE-002-01
 */
describe('analyzeWithDimensions Prompt Template', () => {
  it('includes dimension info in prompt', async () => {
    const { promptService } = await import('../src/services/prompt.service.js');
    const dims = JSON.stringify([
      {
        id: 'stability',
        label: '稳定性',
        description: '产品崩溃等问题',
        keywords: ['崩溃'],
      },
    ]);
    const qaPairs = 'Q: 问题\nA: 回答';

    const prompt = promptService.render('analyzeWithDimensions', {
      dimensions: dims,
      qaPairs,
    });

    expect(prompt).toContain('定性研究分析师');
    expect(prompt).toContain('稳定性');
    expect(prompt).toContain(qaPairs);
  });

  it('renders prompt with no dimensions (zero-config mode)', async () => {
    const { promptService } = await import('../src/services/prompt.service.js');
    const prompt = promptService.render('analyzeWithDimensions', {
      dimensions: '[无预设维度，请自动发现主题]',
      qaPairs: 'Q: 问题\nA: 回答',
    });

    expect(prompt).toContain('定性研究分析师');
    expect(prompt).toContain('Q: 问题');
  });
});
