import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logInfo = vi.fn();
const logWarn = vi.fn();
const logError = vi.fn();

vi.mock('../src/utils/logger.js', () => ({
  info: (...args: unknown[]) => logInfo(...args),
  warn: (...args: unknown[]) => logWarn(...args),
  error: (...args: unknown[]) => logError(...args),
  debug: vi.fn(),
}));

const { collectStartupConfigProblems, logStartupConfigSummary } = await import(
  '../src/utils/startup-config-check.js'
);

/**
 * Issue #218 asked for the missing configuration to be reported at startup
 * instead of only inside a `/health` JSON body. A deployment with no LLM key
 * and the installer's `xxx` DingTalk placeholders booted silently, showed as
 * `healthy` (degraded was a 200), and only revealed the problem when the first
 * respondent got no answer.
 *
 * These checks must be **pure**: a `process.env` in, findings out, so they can
 * be asserted without booting a server, and so the startup log and the health
 * route answer the same question from the same place.
 */

const COMPLETE_ENV: NodeJS.ProcessEnv = {
  LLM_API_KEY: 'sk-real-key',
  LLM_MODEL: 'test-model',
  DINGTALK_CLIENT_ID: 'ding1234567890',
  DINGTALK_CLIENT_SECRET: 'secret-value-here',
  DINGTALK_AGENT_ID: '420123456',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD_HASH: '$2b$12$KIXqQ0H2m9Q0hV0dQ0c0eO8Y2h5k3k5k5k5k5k5k5k5k5k5k5k5k5',
};

describe('startup configuration summary (issue #218)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collectStartupConfigProblems', () => {
    it('reports nothing when the deployment is complete', () => {
      expect(collectStartupConfigProblems(COMPLETE_ENV)).toEqual([]);
    });

    it('names the missing LLM key', () => {
      const env = { ...COMPLETE_ENV };
      delete env['LLM_API_KEY'];

      const problems = collectStartupConfigProblems(env);

      expect(problems).toHaveLength(1);
      expect(problems[0]?.variables).toEqual(['LLM_API_KEY']);
      expect(problems[0]?.message).toContain('no LLM API key');
    });

    it('accepts the Volcengine spelling of the LLM key', () => {
      const env = { ...COMPLETE_ENV };
      delete env['LLM_API_KEY'];
      env['VOLCENGINE_API_KEY'] = 'sk-volc-key';

      expect(collectStartupConfigProblems(env)).toEqual([]);
    });

    it('flags the installer placeholders as unusable', () => {
      const env = {
        ...COMPLETE_ENV,
        LLM_API_KEY: 'your-llm-api-key',
        DINGTALK_CLIENT_ID: 'your-dingtalk-client-id',
      };

      const problems = collectStartupConfigProblems(env);

      expect(problems.map((problem) => problem.variables[0])).toContain('LLM_API_KEY');
      expect(problems.map((problem) => problem.variables[0])).toContain('DINGTALK_CLIENT_ID');
    });

    it('flags the `xxx` placeholder the auto-installer leaves behind', () => {
      const env = { ...COMPLETE_ENV, DINGTALK_CLIENT_ID: 'xxx', DINGTALK_CLIENT_SECRET: 'xxx' };

      const problems = collectStartupConfigProblems(env);

      expect(problems).toHaveLength(1);
      expect(problems[0]?.message).toContain('placeholder');
      expect(problems[0]?.variables).toEqual(['DINGTALK_CLIENT_ID', 'DINGTALK_CLIENT_SECRET']);
    });

    it('lists every missing DingTalk field at once', () => {
      const env = { ...COMPLETE_ENV };
      delete env['DINGTALK_CLIENT_ID'];
      delete env['DINGTALK_AGENT_ID'];

      const problems = collectStartupConfigProblems(env);

      expect(problems).toHaveLength(1);
      expect(problems[0]?.variables).toEqual(['DINGTALK_CLIENT_ID', 'DINGTALK_AGENT_ID']);
    });

    it('respects the DINGTALK_APP_KEY/APP_SECRET aliases', () => {
      const env = { ...COMPLETE_ENV };
      delete env['DINGTALK_CLIENT_ID'];
      delete env['DINGTALK_CLIENT_SECRET'];
      env['DINGTALK_APP_KEY'] = 'ding1234567890';
      env['DINGTALK_APP_SECRET'] = 'secret-value-here';

      expect(collectStartupConfigProblems(env)).toEqual([]);
    });

    it('reports a missing admin login', () => {
      const env = { ...COMPLETE_ENV };
      delete env['ADMIN_PASSWORD_HASH'];

      const problems = collectStartupConfigProblems(env);

      expect(problems).toHaveLength(1);
      expect(problems[0]?.variables).toEqual(['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH']);
    });

    it('reports every problem in one pass rather than stopping at the first', () => {
      const problems = collectStartupConfigProblems({});

      expect(problems.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('logStartupConfigSummary', () => {
    it('logs one info line when nothing is wrong', () => {
      logStartupConfigSummary(COMPLETE_ENV);

      expect(logError).not.toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('complete'));
    });

    it('logs an error naming the variables when something is missing', () => {
      const env = { ...COMPLETE_ENV };
      delete env['LLM_API_KEY'];

      logStartupConfigSummary(env);

      expect(logError).toHaveBeenCalledTimes(1);
      const [message, meta] = logError.mock.calls[0] as [string, { variables: string[] }];
      expect(message).toContain('Incomplete deployment configuration');
      // The message must point at the readiness route, since that is what turns
      // red for the same reason.
      expect(message).toContain('/health/ready');
      expect(meta.variables).toContain('LLM_API_KEY');
    });

    it('logs one warn line per problem so each is individually addressable', () => {
      const env = { ...COMPLETE_ENV };
      delete env['LLM_API_KEY'];
      delete env['ADMIN_PASSWORD_HASH'];

      logStartupConfigSummary(env);

      expect(logWarn).toHaveBeenCalledTimes(2);
    });

    it('never throws on an empty environment (credential-free boot is supported)', () => {
      expect(() => logStartupConfigSummary({})).not.toThrow();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
});
