// Issue #172 regression: E2E suites must stay hermetic against a host .env that
// points at a reachable LLM gateway. CI has no such .env, so without these
// assertions a weakening of the isolation (e.g. back to conditional assignment)
// would only ever reproduce as flakiness on developer machines.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { E2E_LLM_ENV, OWNED_ENV_KEYS_LIST, forceHermeticLLMEnv } from './e2e/helpers/e2e-server.js';

describe('e2e hermetic LLM environment (issue #172)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('contract', () => {
    it('every isolated key is owned, so teardown restores it', () => {
      for (const key of Object.keys(E2E_LLM_ENV)) {
        expect(
          OWNED_ENV_KEYS_LIST,
          `${key} must be in OWNED_ENV_KEYS or it leaks past teardown`
        ).toContain(key);
      }
    });

    it('pins every endpoint to a loopback port-9 listener-less address', () => {
      for (const [key, value] of Object.entries(E2E_LLM_ENV)) {
        if (!key.endsWith('_BASE_URL')) continue;
        const url = new URL(value);
        expect(url.hostname, `${key} must not be routable`).toBe('127.0.0.1');
        expect(url.port, `${key} must fail fast with ECONNREFUSED`).toBe('9');
      }
    });
  });

  describe('override behaviour', () => {
    it('replaces realistic gateway env — primary keys', () => {
      vi.stubEnv('LLM_BASE_URL', 'https://real-gateway.example.com/v1');
      vi.stubEnv('LLM_API_KEY', 'real-secret-key');
      vi.stubEnv('LLM_MODEL', 'real-model');

      forceHermeticLLMEnv();

      expect(process.env['LLM_BASE_URL']).toBe(E2E_LLM_ENV['LLM_BASE_URL']);
      expect(process.env['LLM_API_KEY']).toBe(E2E_LLM_ENV['LLM_API_KEY']);
      expect(process.env['LLM_MODEL']).toBe(E2E_LLM_ENV['LLM_MODEL']);
    });

    it('neutralizes fromEnv() fallback credentials too (VOLCENGINE_*, ANTHROPIC)', () => {
      // fromEnv resolves apiKey = LLM_API_KEY || VOLCENGINE_API_KEY ||
      // ANTHROPIC_AUTH_TOKEN; if that priority ever shifts, a host-provided
      // fallback key must still not win in E2E.
      vi.stubEnv('VOLCENGINE_API_KEY', 'real-volcengine-key');
      vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'real-anthropic-token');
      vi.stubEnv('VOLCENGINE_BASE_URL', 'https://ark.example.com/v1');
      vi.stubEnv('VOLCENGINE_MODEL', 'real-volcengine-model');

      forceHermeticLLMEnv();

      expect(process.env['VOLCENGINE_API_KEY']).toBe(E2E_LLM_ENV['VOLCENGINE_API_KEY']);
      expect(process.env['ANTHROPIC_AUTH_TOKEN']).toBe(E2E_LLM_ENV['ANTHROPIC_AUTH_TOKEN']);
      expect(process.env['VOLCENGINE_BASE_URL']).toBe(E2E_LLM_ENV['VOLCENGINE_BASE_URL']);
      expect(process.env['VOLCENGINE_MODEL']).toBe(E2E_LLM_ENV['VOLCENGINE_MODEL']);
    });
  });
});
