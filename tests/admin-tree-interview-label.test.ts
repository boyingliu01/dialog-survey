import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/server.js';
import { Prisma, type PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

/**
 * End-to-end cover for issue #223: the admin tree's interview leaf used to
 * render `interview.userId` and nothing else. This suite drives the real
 * `GET /admin` route against a real (PGlite) database so the whole chain is
 * exercised — the plan select must include `inviteeData`, the route must attach
 * `_label` to each interview, and the template must render it.
 *
 * An assertion on the rendered HTML rather than on the view-model alone is the
 * point: `findAllForAdminTree` forgetting `inviteeData` again would leave the
 * view-model unit tests green while the page regressed.
 */

const ADMIN_KEY = 'test-admin-key';
let prisma: PrismaClient;
let app: FastifyInstance;

const PLAN_NAME = 'Tree Label Test Plan';
const TEMPLATE_NAME = 'Tree Label Test Template';

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
  vi.stubEnv('SESSION_SECRET', 'a'.repeat(32));
  vi.stubEnv('SESSION_SALT', 'bb'.repeat(16));
  vi.stubEnv('ADMIN_API_KEY', ADMIN_KEY);
  vi.stubEnv('DINGTALK_CLIENT_ID', 'test-client-id');
  vi.stubEnv('DINGTALK_CLIENT_SECRET', 'test-client-secret');
  const result = await buildApp({ prismaFactory: () => prisma });
  app = result.fastify;
  await app.ready();
});

afterAll(async () => {
  await prisma.interview.deleteMany({ where: { plan: { name: PLAN_NAME } } });
  await prisma.interviewPlan.deleteMany({ where: { name: PLAN_NAME } });
  await prisma.template.deleteMany({ where: { name: TEMPLATE_NAME } });
  vi.unstubAllEnvs();
  if (app) await app.close();
  await prisma.$disconnect();
});

async function getTreeHtml(): Promise<string> {
  const response = await app.inject({
    method: 'GET',
    url: '/admin',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  expect(response.statusCode).toBe(200);
  return response.body;
}

describe('GET /admin — interview leaf label (issue #223)', () => {
  it('renders name-phone-userId for an invitee known to the plan', async () => {
    const template = await prisma.template.create({
      data: { name: TEMPLATE_NAME, content: '[]', status: 'DRAFT' },
    });
    const plan = await prisma.interviewPlan.create({
      data: {
        name: PLAN_NAME,
        templateId: template.id,
        status: 'PENDING',
        inviteeData: [{ userId: 'label-user-1', name: '张三', phone: '13800001111' }],
      },
    });
    await prisma.interview.create({
      data: { userId: 'label-user-1', templateId: template.id, planId: plan.id },
    });

    const body = await getTreeHtml();

    expect(body).toContain('张三-13800001111-label-user-1');
    // The hover tooltip carries the same full label, since the row truncates.
    expect(body).toContain('title="张三-13800001111-label-user-1"');
  });

  it('renders name-userId when the invitee row carries no phone', async () => {
    const template = await prisma.template.findFirst({ where: { name: TEMPLATE_NAME } });
    if (!template) throw new Error('template missing');
    const plan = await prisma.interviewPlan.findFirst({ where: { name: PLAN_NAME } });
    if (!plan) throw new Error('plan missing');
    await prisma.interviewPlan.update({
      where: { id: plan.id },
      data: { inviteeData: [{ userId: 'label-user-2', name: '李四' }] },
    });
    await prisma.interview.create({
      data: { userId: 'label-user-2', templateId: template.id, planId: plan.id },
    });

    const body = await getTreeHtml();

    expect(body).toContain('李四-label-user-2');
    expect(body).not.toContain('李四-undefined');
  });

  it('renders the bare userId when the plan knows nothing about the invitee', async () => {
    const template = await prisma.template.findFirst({ where: { name: TEMPLATE_NAME } });
    if (!template) throw new Error('template missing');
    const plan = await prisma.interviewPlan.findFirst({ where: { name: PLAN_NAME } });
    if (!plan) throw new Error('plan missing');
    await prisma.interviewPlan.update({ where: { id: plan.id }, data: { inviteeData: [] } });
    await prisma.interview.create({
      data: { userId: 'label-user-3', templateId: template.id, planId: plan.id },
    });

    const body = await getTreeHtml();

    expect(body).toContain('>label-user-3<');
    expect(body).not.toContain('undefined-label-user-3');
    expect(body).not.toContain('-label-user-3<');
  });

  it('still renders the tree when the plan has no inviteeData at all', async () => {
    const template = await prisma.template.findFirst({ where: { name: TEMPLATE_NAME } });
    if (!template) throw new Error('template missing');
    const plan = await prisma.interviewPlan.findFirst({ where: { name: PLAN_NAME } });
    if (!plan) throw new Error('plan missing');
    await prisma.interviewPlan.update({
      where: { id: plan.id },
      data: { inviteeData: Prisma.DbNull },
    });

    const body = await getTreeHtml();

    expect(body).toContain('tree-node');
    expect(body).toContain('label-user-3');
  });

  it('escapes HTML in the invitee name instead of injecting it', async () => {
    // The name comes from an imported CSV, i.e. from user-supplied data. The
    // label is interpolated into both the element text and its title attribute,
    // so an unescaped name would be a stored-XSS vector on the admin page.
    const template = await prisma.template.findFirst({ where: { name: TEMPLATE_NAME } });
    if (!template) throw new Error('template missing');
    const plan = await prisma.interviewPlan.findFirst({ where: { name: PLAN_NAME } });
    if (!plan) throw new Error('plan missing');
    await prisma.interviewPlan.update({
      where: { id: plan.id },
      data: { inviteeData: [{ userId: 'label-user-xss', name: '<script>alert(1)</script>' }] },
    });
    await prisma.interview.create({
      data: { userId: 'label-user-xss', templateId: template.id, planId: plan.id },
    });

    const body = await getTreeHtml();

    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
