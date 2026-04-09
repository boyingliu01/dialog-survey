import { describe, expect, it } from 'vitest';

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
