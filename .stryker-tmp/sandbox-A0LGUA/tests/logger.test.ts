// @ts-nocheck
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-001-6-01
 * @intent 验证 Logger 工具存在并输出正确函数 (info, warn, error, debug)
 * @covers Logger 工具存在 (info, warn, error, debug)
 */
describe('Logger Utility', () => {
  it('should export logger', async () => {
    const { logger } = await import('../src/utils/logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should export info function', async () => {
    const { info } = await import('../src/utils/logger.js');
    expect(typeof info).toBe('function');
  });

  it('should export warn function', async () => {
    const { warn } = await import('../src/utils/logger.js');
    expect(typeof warn).toBe('function');
  });

  it('should export error function', async () => {
    const { error } = await import('../src/utils/logger.js');
    expect(typeof error).toBe('function');
  });

  it('should export debug function', async () => {
    const { debug } = await import('../src/utils/logger.js');
    expect(typeof debug).toBe('function');
  });
});
