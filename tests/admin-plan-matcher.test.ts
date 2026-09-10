import { describe, expect, it } from 'vitest';
import { isAdministrativePlanMutation } from '../src/api/plans.js';

describe('isAdministrativePlanMutation', () => {
  it.each([
    { name: 'create', method: 'POST', url: '/api/plans', expected: true },
    { name: 'create query', method: 'POST', url: '/api/plans?source=admin', expected: true },
    { name: 'update', method: 'PUT', url: '/api/plans/plan-id', expected: true },
    { name: 'update query', method: 'PUT', url: '/api/plans/plan-id?version=2', expected: true },
    { name: 'send', method: 'POST', url: '/api/plans/plan-id/send', expected: true },
    {
      name: 'interview resend query',
      method: 'POST',
      url: '/api/plans/plan-id/interviews/interview-id/send?retry=true',
      expected: true,
    },
    { name: 'pause', method: 'POST', url: '/api/plans/plan-id/pause', expected: true },
    {
      name: 'resume query',
      method: 'POST',
      url: '/api/plans/plan-id/resume?from=ui',
      expected: true,
    },
    { name: 'cancel', method: 'POST', url: '/api/plans/plan-id/cancel', expected: true },
    { name: 'add member', method: 'POST', url: '/api/plans/plan-id/members', expected: true },
    {
      name: 'delete member query',
      method: 'DELETE',
      url: '/api/plans/plan-id/members/interview-id?force=true',
      expected: true,
    },
    { name: 'remind', method: 'POST', url: '/api/plans/plan-id/remind', expected: true },
    {
      name: 'import preview query',
      method: 'POST',
      url: '/api/plans/plan-id/import-preview?dryRun=true',
      expected: true,
    },
    {
      name: 'import commit',
      method: 'POST',
      url: '/api/plans/plan-id/import-commit',
      expected: true,
    },
    { name: 'create wrong method', method: 'GET', url: '/api/plans', expected: false },
    { name: 'update wrong method', method: 'POST', url: '/api/plans/plan-id', expected: false },
    {
      name: 'send wrong method',
      method: 'DELETE',
      url: '/api/plans/plan-id/send',
      expected: false,
    },
    {
      name: 'member delete wrong method',
      method: 'POST',
      url: '/api/plans/plan-id/members/interview-id',
      expected: false,
    },
    { name: 'trailing slash', method: 'POST', url: '/api/plans/', expected: false },
    { name: 'near-miss collection', method: 'POST', url: '/api/plans-extra', expected: false },
    { name: 'near-miss action', method: 'POST', url: '/api/plans/plan-id/sender', expected: false },
    {
      name: 'near-miss nested resend',
      method: 'POST',
      url: '/api/plans/plan-id/interview/interview-id/send',
      expected: false,
    },
    {
      name: 'near-miss import',
      method: 'POST',
      url: '/api/plans/plan-id/import-finalize',
      expected: false,
    },
  ])('returns $expected for $name', ({ method, url, expected }) => {
    // When
    const result = isAdministrativePlanMutation(method, url);

    // Then
    expect(result).toBe(expected);
  });
});
