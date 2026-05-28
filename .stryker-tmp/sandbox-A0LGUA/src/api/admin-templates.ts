// @ts-nocheck
function stryNS_9fa48() {
  var g =
    (typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis) ||
    new Function('return this')();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (
    ns.activeMutant === undefined &&
    g.process &&
    g.process.env &&
    g.process.env.__STRYKER_ACTIVE_MUTANT__
  ) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov =
    ns.mutantCoverage ||
    (ns.mutantCoverage = {
      static: {},
      perTest: {},
    });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../middleware/admin-auth.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { error, info } from '../utils/logger.js';
const createTemplateSchema = z.object(
  stryMutAct_9fa48('0')
    ? {}
    : (stryCov_9fa48('0'),
      {
        name: stryMutAct_9fa48('1') ? z.string().max(1) : (stryCov_9fa48('1'), z.string().min(1)),
        description: z.string().optional(),
        content: z.object({}).passthrough(),
      })
);
const updateTemplateSchema = z.object(
  stryMutAct_9fa48('2')
    ? {}
    : (stryCov_9fa48('2'),
      {
        name: stryMutAct_9fa48('3') ? z.string().max(1) : (stryCov_9fa48('3'), z.string().min(1)),
        description: z.string().optional(),
        content: z.object({}).passthrough(),
      })
);
const versionSchema = z.object(
  stryMutAct_9fa48('4')
    ? {}
    : (stryCov_9fa48('4'),
      {
        version: z.coerce.number().int().positive(),
      })
);
function buildContentFromForm(body: Record<string, unknown>): Record<string, unknown> {
  if (stryMutAct_9fa48('5')) {
    {
    }
  } else {
    stryCov_9fa48('5');
    // If body already has a content object (JSON POST), use it directly
    if (
      stryMutAct_9fa48('8')
        ? (body.content && typeof body.content === 'object') || !Array.isArray(body.content)
        : stryMutAct_9fa48('7')
          ? false
          : stryMutAct_9fa48('6')
            ? true
            : (stryCov_9fa48('6', '7', '8'),
              (stryMutAct_9fa48('10')
                ? body.content || typeof body.content === 'object'
                : stryMutAct_9fa48('9')
                  ? true
                  : (stryCov_9fa48('9', '10'),
                    body.content &&
                      (stryMutAct_9fa48('12')
                        ? typeof body.content !== 'object'
                        : stryMutAct_9fa48('11')
                          ? true
                          : (stryCov_9fa48('11', '12'),
                            typeof body.content ===
                              (stryMutAct_9fa48('13') ? '' : (stryCov_9fa48('13'), 'object')))))) &&
                (stryMutAct_9fa48('14')
                  ? Array.isArray(body.content)
                  : (stryCov_9fa48('14'), !Array.isArray(body.content))))
    ) {
      if (stryMutAct_9fa48('15')) {
        {
        }
      } else {
        stryCov_9fa48('15');
        return body.content as Record<string, unknown>;
      }
    }
    const content: Record<string, unknown> = stryMutAct_9fa48('16')
      ? {}
      : (stryCov_9fa48('16'),
        {
          invitationPrompt: String(
            stryMutAct_9fa48('19')
              ? body.invitationPrompt && ''
              : stryMutAct_9fa48('18')
                ? false
                : stryMutAct_9fa48('17')
                  ? true
                  : (stryCov_9fa48('17', '18', '19'),
                    body.invitationPrompt ||
                      (stryMutAct_9fa48('20') ? 'Stryker was here!' : (stryCov_9fa48('20'), '')))
          ),
          questions: stryMutAct_9fa48('21') ? ['Stryker was here'] : (stryCov_9fa48('21'), []),
        });
    if (
      stryMutAct_9fa48('23')
        ? false
        : stryMutAct_9fa48('22')
          ? true
          : (stryCov_9fa48('22', '23'), body.closingMessage)
    )
      content.closingMessage = body.closingMessage;
    if (
      stryMutAct_9fa48('25')
        ? false
        : stryMutAct_9fa48('24')
          ? true
          : (stryCov_9fa48('24', '25'), body.llmPromptTemplate)
    )
      content.llmPromptTemplate = body.llmPromptTemplate;

    // Extract questions from body.questions[*][text] (form data format)
    const questionsObj = body.questions as
      | Record<
          string,
          {
            text: string;
          }
        >
      | undefined;
    if (
      stryMutAct_9fa48('28')
        ? questionsObj || typeof questionsObj === 'object'
        : stryMutAct_9fa48('27')
          ? false
          : stryMutAct_9fa48('26')
            ? true
            : (stryCov_9fa48('26', '27', '28'),
              questionsObj &&
                (stryMutAct_9fa48('30')
                  ? typeof questionsObj !== 'object'
                  : stryMutAct_9fa48('29')
                    ? true
                    : (stryCov_9fa48('29', '30'),
                      typeof questionsObj ===
                        (stryMutAct_9fa48('31') ? '' : (stryCov_9fa48('31'), 'object')))))
    ) {
      if (stryMutAct_9fa48('32')) {
        {
        }
      } else {
        stryCov_9fa48('32');
        const questions: string[] = stryMutAct_9fa48('33')
          ? ['Stryker was here']
          : (stryCov_9fa48('33'), []);
        for (const key of stryMutAct_9fa48('34')
          ? Object.keys(questionsObj)
          : (stryCov_9fa48('34'), Object.keys(questionsObj).sort())) {
          if (stryMutAct_9fa48('35')) {
            {
            }
          } else {
            stryCov_9fa48('35');
            const q = questionsObj[key];
            if (
              stryMutAct_9fa48('38')
                ? (q && typeof q === 'object') || typeof q.text === 'string'
                : stryMutAct_9fa48('37')
                  ? false
                  : stryMutAct_9fa48('36')
                    ? true
                    : (stryCov_9fa48('36', '37', '38'),
                      (stryMutAct_9fa48('40')
                        ? q || typeof q === 'object'
                        : stryMutAct_9fa48('39')
                          ? true
                          : (stryCov_9fa48('39', '40'),
                            q &&
                              (stryMutAct_9fa48('42')
                                ? typeof q !== 'object'
                                : stryMutAct_9fa48('41')
                                  ? true
                                  : (stryCov_9fa48('41', '42'),
                                    typeof q ===
                                      (stryMutAct_9fa48('43')
                                        ? ''
                                        : (stryCov_9fa48('43'), 'object')))))) &&
                        (stryMutAct_9fa48('45')
                          ? typeof q.text !== 'string'
                          : stryMutAct_9fa48('44')
                            ? true
                            : (stryCov_9fa48('44', '45'),
                              typeof q.text ===
                                (stryMutAct_9fa48('46') ? '' : (stryCov_9fa48('46'), 'string')))))
            ) {
              if (stryMutAct_9fa48('47')) {
                {
                }
              } else {
                stryCov_9fa48('47');
                const trimmed = stryMutAct_9fa48('48')
                  ? q.text
                  : (stryCov_9fa48('48'), q.text.trim());
                if (
                  stryMutAct_9fa48('50')
                    ? false
                    : stryMutAct_9fa48('49')
                      ? true
                      : (stryCov_9fa48('49', '50'), trimmed)
                )
                  questions.push(trimmed);
              }
            }
          }
        }
        content.questions = questions;
      }
    }
    return content;
  }
}
function htmlEscape(text: string): string {
  if (stryMutAct_9fa48('51')) {
    {
    }
  } else {
    stryCov_9fa48('51');
    return text
      .replace(/&/g, stryMutAct_9fa48('52') ? '' : (stryCov_9fa48('52'), '&amp;'))
      .replace(/</g, stryMutAct_9fa48('53') ? '' : (stryCov_9fa48('53'), '&lt;'))
      .replace(/>/g, stryMutAct_9fa48('54') ? '' : (stryCov_9fa48('54'), '&gt;'))
      .replace(/"/g, stryMutAct_9fa48('55') ? '' : (stryCov_9fa48('55'), '&quot;'))
      .replace(/'/g, stryMutAct_9fa48('56') ? '' : (stryCov_9fa48('56'), '&#x27;'));
  }
}
function htmlError(message: string): string {
  if (stryMutAct_9fa48('57')) {
    {
    }
  } else {
    stryCov_9fa48('57');
    return stryMutAct_9fa48('58')
      ? ``
      : (stryCov_9fa48('58'), `<div class="text-red-600">${htmlEscape(message)}</div>`);
  }
}
function fmtDate(d: Date | null | undefined): string {
  if (stryMutAct_9fa48('59')) {
    {
    }
  } else {
    stryCov_9fa48('59');
    return stryMutAct_9fa48('60')
      ? d?.toLocaleString('zh-CN') && '-'
      : (stryCov_9fa48('60'),
        (stryMutAct_9fa48('61')
          ? d.toLocaleString('zh-CN')
          : (stryCov_9fa48('61'),
            d?.toLocaleString(stryMutAct_9fa48('62') ? '' : (stryCov_9fa48('62'), 'zh-CN')))) ??
          (stryMutAct_9fa48('63') ? '' : (stryCov_9fa48('63'), '-')));
  }
}
const ADMIN_API_KEY = stryMutAct_9fa48('66')
  ? process.env.ADMIN_API_KEY && ''
  : stryMutAct_9fa48('65')
    ? false
    : stryMutAct_9fa48('64')
      ? true
      : (stryCov_9fa48('64', '65', '66'),
        process.env.ADMIN_API_KEY ||
          (stryMutAct_9fa48('67') ? 'Stryker was here!' : (stryCov_9fa48('67'), '')));
export async function adminTemplatesRoutes(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('68')) {
    {
    }
  } else {
    stryCov_9fa48('68');
    const templateRepo = new TemplateRepository();
    const prisma = new PrismaClient();
    const BASE_PATH = stryMutAct_9fa48('69') ? '' : (stryCov_9fa48('69'), '/admin');
    const API_PATH = stryMutAct_9fa48('70') ? '' : (stryCov_9fa48('70'), '/admin/api');

    // GET /admin — Tree view main entry (new hierarchical UI)
    fastify.get(
      stryMutAct_9fa48('71') ? '' : (stryCov_9fa48('71'), '/admin'),
      stryMutAct_9fa48('72')
        ? {}
        : (stryCov_9fa48('72'),
          {
            preHandler: adminAuth,
          }),
      async (_request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('73')) {
          {
          }
        } else {
          stryCov_9fa48('73');
          try {
            if (stryMutAct_9fa48('74')) {
              {
              }
            } else {
              stryCov_9fa48('74');
              const templates = await prisma.template.findMany(
                stryMutAct_9fa48('75')
                  ? {}
                  : (stryCov_9fa48('75'),
                    {
                      orderBy: stryMutAct_9fa48('76')
                        ? {}
                        : (stryCov_9fa48('76'),
                          {
                            name: stryMutAct_9fa48('77') ? '' : (stryCov_9fa48('77'), 'asc'),
                          }),
                      select: stryMutAct_9fa48('78')
                        ? {}
                        : (stryCov_9fa48('78'),
                          {
                            id: stryMutAct_9fa48('79') ? false : (stryCov_9fa48('79'), true),
                            name: stryMutAct_9fa48('80') ? false : (stryCov_9fa48('80'), true),
                            description: stryMutAct_9fa48('81')
                              ? false
                              : (stryCov_9fa48('81'), true),
                            status: stryMutAct_9fa48('82') ? false : (stryCov_9fa48('82'), true),
                            version: stryMutAct_9fa48('83') ? false : (stryCov_9fa48('83'), true),
                            createdAt: stryMutAct_9fa48('84') ? false : (stryCov_9fa48('84'), true),
                            _count: stryMutAct_9fa48('85')
                              ? {}
                              : (stryCov_9fa48('85'),
                                {
                                  select: stryMutAct_9fa48('86')
                                    ? {}
                                    : (stryCov_9fa48('86'),
                                      {
                                        interviewPlans: stryMutAct_9fa48('87')
                                          ? false
                                          : (stryCov_9fa48('87'), true),
                                        interviews: stryMutAct_9fa48('88')
                                          ? false
                                          : (stryCov_9fa48('88'), true),
                                      }),
                                }),
                            interviewPlans: stryMutAct_9fa48('89')
                              ? {}
                              : (stryCov_9fa48('89'),
                                {
                                  orderBy: stryMutAct_9fa48('90')
                                    ? {}
                                    : (stryCov_9fa48('90'),
                                      {
                                        createdAt: stryMutAct_9fa48('91')
                                          ? ''
                                          : (stryCov_9fa48('91'), 'desc'),
                                      }),
                                  take: 20,
                                  select: stryMutAct_9fa48('92')
                                    ? {}
                                    : (stryCov_9fa48('92'),
                                      {
                                        id: stryMutAct_9fa48('93')
                                          ? false
                                          : (stryCov_9fa48('93'), true),
                                        name: stryMutAct_9fa48('94')
                                          ? false
                                          : (stryCov_9fa48('94'), true),
                                        description: stryMutAct_9fa48('95')
                                          ? false
                                          : (stryCov_9fa48('95'), true),
                                        status: stryMutAct_9fa48('96')
                                          ? false
                                          : (stryCov_9fa48('96'), true),
                                        completedCount: stryMutAct_9fa48('97')
                                          ? false
                                          : (stryCov_9fa48('97'), true),
                                        sentCount: stryMutAct_9fa48('98')
                                          ? false
                                          : (stryCov_9fa48('98'), true),
                                        createdAt: stryMutAct_9fa48('99')
                                          ? false
                                          : (stryCov_9fa48('99'), true),
                                        _count: stryMutAct_9fa48('100')
                                          ? {}
                                          : (stryCov_9fa48('100'),
                                            {
                                              select: stryMutAct_9fa48('101')
                                                ? {}
                                                : (stryCov_9fa48('101'),
                                                  {
                                                    interviews: stryMutAct_9fa48('102')
                                                      ? false
                                                      : (stryCov_9fa48('102'), true),
                                                  }),
                                            }),
                                        interviews: stryMutAct_9fa48('103')
                                          ? {}
                                          : (stryCov_9fa48('103'),
                                            {
                                              orderBy: stryMutAct_9fa48('104')
                                                ? {}
                                                : (stryCov_9fa48('104'),
                                                  {
                                                    createdAt: stryMutAct_9fa48('105')
                                                      ? ''
                                                      : (stryCov_9fa48('105'), 'desc'),
                                                  }),
                                              take: 15,
                                              select: stryMutAct_9fa48('106')
                                                ? {}
                                                : (stryCov_9fa48('106'),
                                                  {
                                                    id: stryMutAct_9fa48('107')
                                                      ? false
                                                      : (stryCov_9fa48('107'), true),
                                                    userId: stryMutAct_9fa48('108')
                                                      ? false
                                                      : (stryCov_9fa48('108'), true),
                                                    status: stryMutAct_9fa48('109')
                                                      ? false
                                                      : (stryCov_9fa48('109'), true),
                                                    completedAt: stryMutAct_9fa48('110')
                                                      ? false
                                                      : (stryCov_9fa48('110'), true),
                                                  }),
                                            }),
                                      }),
                                }),
                          }),
                    })
              );
              const templatesWithPlans = templates.map(
                stryMutAct_9fa48('111')
                  ? () => undefined
                  : (stryCov_9fa48('111'),
                    (t) =>
                      stryMutAct_9fa48('112')
                        ? {}
                        : (stryCov_9fa48('112'),
                          {
                            ...t,
                            _plans: t.interviewPlans.map(
                              stryMutAct_9fa48('113')
                                ? () => undefined
                                : (stryCov_9fa48('113'),
                                  (p) =>
                                    stryMutAct_9fa48('114')
                                      ? {}
                                      : (stryCov_9fa48('114'),
                                        {
                                          ...p,
                                          _interviews: p.interviews,
                                          _interviewCount: p._count.interviews,
                                          _completedCount: stryMutAct_9fa48('115')
                                            ? p.interviews.length
                                            : (stryCov_9fa48('115'),
                                              p.interviews.filter(
                                                stryMutAct_9fa48('116')
                                                  ? () => undefined
                                                  : (stryCov_9fa48('116'),
                                                    (i) =>
                                                      stryMutAct_9fa48('119')
                                                        ? i.status !== 'COMPLETED'
                                                        : stryMutAct_9fa48('118')
                                                          ? false
                                                          : stryMutAct_9fa48('117')
                                                            ? true
                                                            : (stryCov_9fa48('117', '118', '119'),
                                                              i.status ===
                                                                (stryMutAct_9fa48('120')
                                                                  ? ''
                                                                  : (stryCov_9fa48('120'),
                                                                    'COMPLETED'))))
                                              ).length),
                                        }))
                            ),
                            _planCount: t._count.interviewPlans,
                            _interviewCount: t._count.interviews,
                            interviewPlans: undefined,
                          }))
              );
              return reply.view(
                stryMutAct_9fa48('121') ? '' : (stryCov_9fa48('121'), 'layouts/admin-tree.njk'),
                stryMutAct_9fa48('122')
                  ? {}
                  : (stryCov_9fa48('122'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      templates: templatesWithPlans,
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('123')) {
              {
              }
            } else {
              stryCov_9fa48('123');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('124')
                    ? ''
                    : (stryCov_9fa48('124'), 'Failed to load admin tree');
              error(
                stryMutAct_9fa48('125') ? '' : (stryCov_9fa48('125'), 'Failed to load admin tree'),
                stryMutAct_9fa48('126')
                  ? {}
                  : (stryCov_9fa48('126'),
                    {
                      error: errMsg,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('127') ? '' : (stryCov_9fa48('127'), 'error.njk'),
                stryMutAct_9fa48('128')
                  ? {}
                  : (stryCov_9fa48('128'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );

    // GET /admin/content/templates/:id
    fastify.get(
      stryMutAct_9fa48('129') ? '' : (stryCov_9fa48('129'), '/admin/content/templates/:id'),
      stryMutAct_9fa48('130')
        ? {}
        : (stryCov_9fa48('130'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('131')) {
          {
          }
        } else {
          stryCov_9fa48('131');
          const { id } = request.params as {
            id: string;
          };
          const template = await prisma.template.findUnique(
            stryMutAct_9fa48('132')
              ? {}
              : (stryCov_9fa48('132'),
                {
                  where: stryMutAct_9fa48('133')
                    ? {}
                    : (stryCov_9fa48('133'),
                      {
                        id,
                      }),
                  select: stryMutAct_9fa48('134')
                    ? {}
                    : (stryCov_9fa48('134'),
                      {
                        id: stryMutAct_9fa48('135') ? false : (stryCov_9fa48('135'), true),
                        name: stryMutAct_9fa48('136') ? false : (stryCov_9fa48('136'), true),
                        description: stryMutAct_9fa48('137') ? false : (stryCov_9fa48('137'), true),
                        status: stryMutAct_9fa48('138') ? false : (stryCov_9fa48('138'), true),
                        version: stryMutAct_9fa48('139') ? false : (stryCov_9fa48('139'), true),
                        createdAt: stryMutAct_9fa48('140') ? false : (stryCov_9fa48('140'), true),
                        updatedAt: stryMutAct_9fa48('141') ? false : (stryCov_9fa48('141'), true),
                        _count: stryMutAct_9fa48('142')
                          ? {}
                          : (stryCov_9fa48('142'),
                            {
                              select: stryMutAct_9fa48('143')
                                ? {}
                                : (stryCov_9fa48('143'),
                                  {
                                    interviewPlans: stryMutAct_9fa48('144')
                                      ? false
                                      : (stryCov_9fa48('144'), true),
                                    interviews: stryMutAct_9fa48('145')
                                      ? false
                                      : (stryCov_9fa48('145'), true),
                                  }),
                            }),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('148')
              ? false
              : stryMutAct_9fa48('147')
                ? true
                : stryMutAct_9fa48('146')
                  ? template
                  : (stryCov_9fa48('146', '147', '148'), !template)
          )
            return reply
              .status(404)
              .type(stryMutAct_9fa48('149') ? '' : (stryCov_9fa48('149'), 'text/html'))
              .send(stryMutAct_9fa48('150') ? '' : (stryCov_9fa48('150'), '模板不存在'));
          const tpl = stryMutAct_9fa48('151')
            ? {}
            : (stryCov_9fa48('151'),
              {
                ...template,
                _planCount: template._count.interviewPlans,
                _interviewCount: template._count.interviews,
              });
          return reply.view(
            stryMutAct_9fa48('152')
              ? ''
              : (stryCov_9fa48('152'), 'admin/content/template-info.njk'),
            stryMutAct_9fa48('153')
              ? {}
              : (stryCov_9fa48('153'),
                {
                  adminApiKey: ADMIN_API_KEY,
                  template: tpl,
                })
          );
        }
      }
    );

    // GET /admin/content/plans/:id
    fastify.get(
      stryMutAct_9fa48('154') ? '' : (stryCov_9fa48('154'), '/admin/content/plans/:id'),
      stryMutAct_9fa48('155')
        ? {}
        : (stryCov_9fa48('155'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('156')) {
          {
          }
        } else {
          stryCov_9fa48('156');
          const { id } = request.params as {
            id: string;
          };
          const plan = await prisma.interviewPlan.findUnique(
            stryMutAct_9fa48('157')
              ? {}
              : (stryCov_9fa48('157'),
                {
                  where: stryMutAct_9fa48('158')
                    ? {}
                    : (stryCov_9fa48('158'),
                      {
                        id,
                      }),
                  include: stryMutAct_9fa48('159')
                    ? {}
                    : (stryCov_9fa48('159'),
                      {
                        template: stryMutAct_9fa48('160')
                          ? {}
                          : (stryCov_9fa48('160'),
                            {
                              select: stryMutAct_9fa48('161')
                                ? {}
                                : (stryCov_9fa48('161'),
                                  {
                                    id: stryMutAct_9fa48('162')
                                      ? false
                                      : (stryCov_9fa48('162'), true),
                                    name: stryMutAct_9fa48('163')
                                      ? false
                                      : (stryCov_9fa48('163'), true),
                                  }),
                            }),
                        interviews: stryMutAct_9fa48('164')
                          ? {}
                          : (stryCov_9fa48('164'),
                            {
                              orderBy: stryMutAct_9fa48('165')
                                ? {}
                                : (stryCov_9fa48('165'),
                                  {
                                    status: stryMutAct_9fa48('166')
                                      ? ''
                                      : (stryCov_9fa48('166'), 'asc'),
                                  }),
                              select: stryMutAct_9fa48('167')
                                ? {}
                                : (stryCov_9fa48('167'),
                                  {
                                    id: stryMutAct_9fa48('168')
                                      ? false
                                      : (stryCov_9fa48('168'), true),
                                    userId: stryMutAct_9fa48('169')
                                      ? false
                                      : (stryCov_9fa48('169'), true),
                                    status: stryMutAct_9fa48('170')
                                      ? false
                                      : (stryCov_9fa48('170'), true),
                                    createdAt: stryMutAct_9fa48('171')
                                      ? false
                                      : (stryCov_9fa48('171'), true),
                                    completedAt: stryMutAct_9fa48('172')
                                      ? false
                                      : (stryCov_9fa48('172'), true),
                                  }),
                            }),
                        _count: stryMutAct_9fa48('173')
                          ? {}
                          : (stryCov_9fa48('173'),
                            {
                              select: stryMutAct_9fa48('174')
                                ? {}
                                : (stryCov_9fa48('174'),
                                  {
                                    interviews: stryMutAct_9fa48('175')
                                      ? false
                                      : (stryCov_9fa48('175'), true),
                                  }),
                            }),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('178')
              ? false
              : stryMutAct_9fa48('177')
                ? true
                : stryMutAct_9fa48('176')
                  ? plan
                  : (stryCov_9fa48('176', '177', '178'), !plan)
          )
            return reply
              .status(404)
              .type(stryMutAct_9fa48('179') ? '' : (stryCov_9fa48('179'), 'text/html'))
              .send(stryMutAct_9fa48('180') ? '' : (stryCov_9fa48('180'), '计划不存在'));
          const completed = stryMutAct_9fa48('181')
            ? plan.interviews
            : (stryCov_9fa48('181'),
              plan.interviews.filter(
                stryMutAct_9fa48('182')
                  ? () => undefined
                  : (stryCov_9fa48('182'),
                    (i) =>
                      stryMutAct_9fa48('185')
                        ? i.status !== 'COMPLETED'
                        : stryMutAct_9fa48('184')
                          ? false
                          : stryMutAct_9fa48('183')
                            ? true
                            : (stryCov_9fa48('183', '184', '185'),
                              i.status ===
                                (stryMutAct_9fa48('186')
                                  ? ''
                                  : (stryCov_9fa48('186'), 'COMPLETED'))))
              ));
          return reply.view(
            stryMutAct_9fa48('187') ? '' : (stryCov_9fa48('187'), 'admin/content/plan-detail.njk'),
            stryMutAct_9fa48('188')
              ? {}
              : (stryCov_9fa48('188'),
                {
                  adminApiKey: ADMIN_API_KEY,
                  plan,
                  template: plan.template,
                  interviews: plan.interviews,
                  totalInterviews: plan._count.interviews,
                  completedCount: completed.length,
                  completionRate: (
                    stryMutAct_9fa48('192')
                      ? plan.sentCount <= 0
                      : stryMutAct_9fa48('191')
                        ? plan.sentCount >= 0
                        : stryMutAct_9fa48('190')
                          ? false
                          : stryMutAct_9fa48('189')
                            ? true
                            : (stryCov_9fa48('189', '190', '191', '192'), plan.sentCount > 0)
                  )
                    ? Math.round(
                        stryMutAct_9fa48('193')
                          ? completed.length / plan.sentCount / 100
                          : (stryCov_9fa48('193'),
                            (stryMutAct_9fa48('194')
                              ? completed.length * plan.sentCount
                              : (stryCov_9fa48('194'), completed.length / plan.sentCount)) * 100)
                      )
                    : 0,
                })
          );
        }
      }
    );

    // GET /admin/content/plans/:id/all-interviews
    fastify.get(
      stryMutAct_9fa48('195')
        ? ''
        : (stryCov_9fa48('195'), '/admin/content/plans/:id/all-interviews'),
      stryMutAct_9fa48('196')
        ? {}
        : (stryCov_9fa48('196'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('197')) {
          {
          }
        } else {
          stryCov_9fa48('197');
          const { id } = request.params as {
            id: string;
          };
          const interviews = await prisma.interview.findMany(
            stryMutAct_9fa48('198')
              ? {}
              : (stryCov_9fa48('198'),
                {
                  where: stryMutAct_9fa48('199')
                    ? {}
                    : (stryCov_9fa48('199'),
                      {
                        planId: id,
                      }),
                  orderBy: stryMutAct_9fa48('200')
                    ? {}
                    : (stryCov_9fa48('200'),
                      {
                        status: stryMutAct_9fa48('201') ? '' : (stryCov_9fa48('201'), 'asc'),
                      }),
                  select: stryMutAct_9fa48('202')
                    ? {}
                    : (stryCov_9fa48('202'),
                      {
                        id: stryMutAct_9fa48('203') ? false : (stryCov_9fa48('203'), true),
                        userId: stryMutAct_9fa48('204') ? false : (stryCov_9fa48('204'), true),
                        status: stryMutAct_9fa48('205') ? false : (stryCov_9fa48('205'), true),
                        completedAt: stryMutAct_9fa48('206') ? false : (stryCov_9fa48('206'), true),
                      }),
                })
          );
          const plan = await prisma.interviewPlan.findUnique(
            stryMutAct_9fa48('207')
              ? {}
              : (stryCov_9fa48('207'),
                {
                  where: stryMutAct_9fa48('208')
                    ? {}
                    : (stryCov_9fa48('208'),
                      {
                        id,
                      }),
                  include: stryMutAct_9fa48('209')
                    ? {}
                    : (stryCov_9fa48('209'),
                      {
                        template: stryMutAct_9fa48('210')
                          ? {}
                          : (stryCov_9fa48('210'),
                            {
                              select: stryMutAct_9fa48('211')
                                ? {}
                                : (stryCov_9fa48('211'),
                                  {
                                    id: stryMutAct_9fa48('212')
                                      ? false
                                      : (stryCov_9fa48('212'), true),
                                    name: stryMutAct_9fa48('213')
                                      ? false
                                      : (stryCov_9fa48('213'), true),
                                  }),
                            }),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('216')
              ? false
              : stryMutAct_9fa48('215')
                ? true
                : stryMutAct_9fa48('214')
                  ? plan
                  : (stryCov_9fa48('214', '215', '216'), !plan)
          )
            return reply
              .status(404)
              .type(stryMutAct_9fa48('217') ? '' : (stryCov_9fa48('217'), 'text/html'))
              .send(stryMutAct_9fa48('218') ? '' : (stryCov_9fa48('218'), '计划不存在'));
          const completed = stryMutAct_9fa48('219')
            ? interviews
            : (stryCov_9fa48('219'),
              interviews.filter(
                stryMutAct_9fa48('220')
                  ? () => undefined
                  : (stryCov_9fa48('220'),
                    (i) =>
                      stryMutAct_9fa48('223')
                        ? i.status !== 'COMPLETED'
                        : stryMutAct_9fa48('222')
                          ? false
                          : stryMutAct_9fa48('221')
                            ? true
                            : (stryCov_9fa48('221', '222', '223'),
                              i.status ===
                                (stryMutAct_9fa48('224')
                                  ? ''
                                  : (stryCov_9fa48('224'), 'COMPLETED'))))
              ));
          return reply.view(
            stryMutAct_9fa48('225') ? '' : (stryCov_9fa48('225'), 'admin/content/plan-detail.njk'),
            stryMutAct_9fa48('226')
              ? {}
              : (stryCov_9fa48('226'),
                {
                  adminApiKey: ADMIN_API_KEY,
                  plan: stryMutAct_9fa48('227')
                    ? {}
                    : (stryCov_9fa48('227'),
                      {
                        ...plan,
                        sentCount: 0,
                      }),
                  template: plan.template,
                  interviews,
                  totalInterviews: interviews.length,
                  completedCount: completed.length,
                  completionRate: 0,
                })
          );
        }
      }
    );

    // GET /admin/content/reports/:interviewId
    fastify.get(
      stryMutAct_9fa48('228') ? '' : (stryCov_9fa48('228'), '/admin/content/reports/:interviewId'),
      stryMutAct_9fa48('229')
        ? {}
        : (stryCov_9fa48('229'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('230')) {
          {
          }
        } else {
          stryCov_9fa48('230');
          const { interviewId } = request.params as {
            interviewId: string;
          };
          const interview = await prisma.interview.findUnique(
            stryMutAct_9fa48('231')
              ? {}
              : (stryCov_9fa48('231'),
                {
                  where: stryMutAct_9fa48('232')
                    ? {}
                    : (stryCov_9fa48('232'),
                      {
                        id: interviewId,
                      }),
                  select: stryMutAct_9fa48('233')
                    ? {}
                    : (stryCov_9fa48('233'),
                      {
                        id: stryMutAct_9fa48('234') ? false : (stryCov_9fa48('234'), true),
                        userId: stryMutAct_9fa48('235') ? false : (stryCov_9fa48('235'), true),
                        status: stryMutAct_9fa48('236') ? false : (stryCov_9fa48('236'), true),
                        createdAt: stryMutAct_9fa48('237') ? false : (stryCov_9fa48('237'), true),
                        completedAt: stryMutAct_9fa48('238') ? false : (stryCov_9fa48('238'), true),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('241')
              ? false
              : stryMutAct_9fa48('240')
                ? true
                : stryMutAct_9fa48('239')
                  ? interview
                  : (stryCov_9fa48('239', '240', '241'), !interview)
          )
            return reply
              .status(404)
              .type(stryMutAct_9fa48('242') ? '' : (stryCov_9fa48('242'), 'text/html'))
              .send(stryMutAct_9fa48('243') ? '' : (stryCov_9fa48('243'), '访谈不存在'));
          const report = await prisma.analysisReport.findFirst(
            stryMutAct_9fa48('244')
              ? {}
              : (stryCov_9fa48('244'),
                {
                  where: stryMutAct_9fa48('245')
                    ? {}
                    : (stryCov_9fa48('245'),
                      {
                        interviewId,
                      }),
                  orderBy: stryMutAct_9fa48('246')
                    ? {}
                    : (stryCov_9fa48('246'),
                      {
                        createdAt: stryMutAct_9fa48('247') ? '' : (stryCov_9fa48('247'), 'desc'),
                      }),
                })
          );
          return reply.view(
            stryMutAct_9fa48('248')
              ? ''
              : (stryCov_9fa48('248'), 'admin/content/report-detail.njk'),
            stryMutAct_9fa48('249')
              ? {}
              : (stryCov_9fa48('249'),
                {
                  adminApiKey: ADMIN_API_KEY,
                  interview,
                  report,
                })
          );
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('250') ? `` : (stryCov_9fa48('250'), `${BASE_PATH}/templates`),
      stryMutAct_9fa48('251')
        ? {}
        : (stryCov_9fa48('251'),
          {
            preHandler: adminAuth,
          }),
      async (_request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('252')) {
          {
          }
        } else {
          stryCov_9fa48('252');
          try {
            if (stryMutAct_9fa48('253')) {
              {
              }
            } else {
              stryCov_9fa48('253');
              const pageParam = (_request.query as Record<string, string | undefined>).page;
              const page = pageParam
                ? stryMutAct_9fa48('254')
                  ? Math.min(1, Number.parseInt(pageParam, 10))
                  : (stryCov_9fa48('254'), Math.max(1, Number.parseInt(pageParam, 10)))
                : 1;
              const limit = 20;
              const result = await templateRepo.findAllPaginated(page, limit);
              const templates = await Promise.all(
                result.items.map(
                  stryMutAct_9fa48('255')
                    ? () => undefined
                    : (stryCov_9fa48('255'),
                      async (t) =>
                        stryMutAct_9fa48('256')
                          ? {}
                          : (stryCov_9fa48('256'),
                            {
                              ...t,
                              usageStats: await templateRepo.getUsageStats(t.id),
                            }))
                )
              );
              return reply.view(
                stryMutAct_9fa48('257') ? '' : (stryCov_9fa48('257'), 'templates/index.njk'),
                stryMutAct_9fa48('258')
                  ? {}
                  : (stryCov_9fa48('258'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      templates,
                      pagination: stryMutAct_9fa48('259')
                        ? {}
                        : (stryCov_9fa48('259'),
                          {
                            total: result.total,
                            page: result.page,
                            limit: result.limit,
                          }),
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('260')) {
              {
              }
            } else {
              stryCov_9fa48('260');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('261')
                    ? ''
                    : (stryCov_9fa48('261'), 'Failed to load templates');
              error(
                stryMutAct_9fa48('262')
                  ? ''
                  : (stryCov_9fa48('262'), 'Failed to load admin templates list'),
                stryMutAct_9fa48('263')
                  ? {}
                  : (stryCov_9fa48('263'),
                    {
                      error: errMsg,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('264') ? '' : (stryCov_9fa48('264'), 'error.njk'),
                stryMutAct_9fa48('265')
                  ? {}
                  : (stryCov_9fa48('265'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('266') ? `` : (stryCov_9fa48('266'), `${BASE_PATH}/templates/new`),
      stryMutAct_9fa48('267')
        ? {}
        : (stryCov_9fa48('267'),
          {
            preHandler: adminAuth,
          }),
      async (_r: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('268')) {
          {
          }
        } else {
          stryCov_9fa48('268');
          return reply.view(
            stryMutAct_9fa48('269') ? '' : (stryCov_9fa48('269'), 'templates/form.njk'),
            stryMutAct_9fa48('270')
              ? {}
              : (stryCov_9fa48('270'),
                {
                  adminApiKey: ADMIN_API_KEY,
                  isEdit: stryMutAct_9fa48('271') ? true : (stryCov_9fa48('271'), false),
                  template: null,
                  existingQuestions: stryMutAct_9fa48('272')
                    ? ['Stryker was here']
                    : (stryCov_9fa48('272'), []),
                  action: stryMutAct_9fa48('273') ? '' : (stryCov_9fa48('273'), 'create'),
                })
          );
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('274') ? `` : (stryCov_9fa48('274'), `${BASE_PATH}/templates/:id/edit`),
      stryMutAct_9fa48('275')
        ? {}
        : (stryCov_9fa48('275'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('276')) {
          {
          }
        } else {
          stryCov_9fa48('276');
          const { id } = request.params as {
            id: string;
          };
          try {
            if (stryMutAct_9fa48('277')) {
              {
              }
            } else {
              stryCov_9fa48('277');
              const template = await templateRepo.findById(id);
              if (
                stryMutAct_9fa48('280')
                  ? false
                  : stryMutAct_9fa48('279')
                    ? true
                    : stryMutAct_9fa48('278')
                      ? template
                      : (stryCov_9fa48('278', '279', '280'), !template)
              )
                return reply.status(404).view(
                  stryMutAct_9fa48('281') ? '' : (stryCov_9fa48('281'), 'error.njk'),
                  stryMutAct_9fa48('282')
                    ? {}
                    : (stryCov_9fa48('282'),
                      {
                        message: stryMutAct_9fa48('283')
                          ? ''
                          : (stryCov_9fa48('283'), 'Template not found'),
                      })
                );
              let parsedContent: Record<string, unknown>;
              try {
                if (stryMutAct_9fa48('284')) {
                  {
                  }
                } else {
                  stryCov_9fa48('284');
                  parsedContent = JSON.parse(template.content) as Record<string, unknown>;
                }
              } catch {
                if (stryMutAct_9fa48('285')) {
                  {
                  }
                } else {
                  stryCov_9fa48('285');
                  parsedContent = {};
                }
              }
              const questions = stryMutAct_9fa48('288')
                ? (parsedContent.questions as string[]) && []
                : stryMutAct_9fa48('287')
                  ? false
                  : stryMutAct_9fa48('286')
                    ? true
                    : (stryCov_9fa48('286', '287', '288'),
                      (parsedContent.questions as string[]) ||
                        (stryMutAct_9fa48('289')
                          ? ['Stryker was here']
                          : (stryCov_9fa48('289'), [])));
              return reply.view(
                stryMutAct_9fa48('290') ? '' : (stryCov_9fa48('290'), 'templates/form.njk'),
                stryMutAct_9fa48('291')
                  ? {}
                  : (stryCov_9fa48('291'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      isEdit: stryMutAct_9fa48('292') ? false : (stryCov_9fa48('292'), true),
                      template: stryMutAct_9fa48('293')
                        ? {}
                        : (stryCov_9fa48('293'),
                          {
                            ...template,
                            ...parsedContent,
                          }),
                      existingQuestions: questions.map(
                        stryMutAct_9fa48('294')
                          ? () => undefined
                          : (stryCov_9fa48('294'),
                            (q, i) =>
                              stryMutAct_9fa48('295')
                                ? {}
                                : (stryCov_9fa48('295'),
                                  {
                                    text: q,
                                    order: i,
                                  }))
                      ),
                      action: stryMutAct_9fa48('296') ? '' : (stryCov_9fa48('296'), 'edit'),
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('297')) {
              {
              }
            } else {
              stryCov_9fa48('297');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('298')
                    ? ''
                    : (stryCov_9fa48('298'), 'Failed to load template');
              error(
                stryMutAct_9fa48('299')
                  ? ''
                  : (stryCov_9fa48('299'), 'Failed to load admin template edit form'),
                stryMutAct_9fa48('300')
                  ? {}
                  : (stryCov_9fa48('300'),
                    {
                      error: errMsg,
                      templateId: id,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('301') ? '' : (stryCov_9fa48('301'), 'error.njk'),
                stryMutAct_9fa48('302')
                  ? {}
                  : (stryCov_9fa48('302'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('303') ? `` : (stryCov_9fa48('303'), `${API_PATH}/templates`),
      stryMutAct_9fa48('304')
        ? {}
        : (stryCov_9fa48('304'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('305')) {
          {
          }
        } else {
          stryCov_9fa48('305');
          try {
            if (stryMutAct_9fa48('306')) {
              {
              }
            } else {
              stryCov_9fa48('306');
              const rawBody = request.body as Record<string, unknown>;
              const content = buildContentFromForm(rawBody);
              const input = createTemplateSchema.parse(
                stryMutAct_9fa48('307')
                  ? {}
                  : (stryCov_9fa48('307'),
                    {
                      name: rawBody.name,
                      description: rawBody.description,
                      content,
                    })
              );
              await templateRepo.create(
                stryMutAct_9fa48('308')
                  ? {}
                  : (stryCov_9fa48('308'),
                    {
                      name: input.name,
                      description: input.description,
                      content: input.content as Record<string, unknown>,
                    })
              );
              info(
                stryMutAct_9fa48('309') ? '' : (stryCov_9fa48('309'), 'Admin template created'),
                stryMutAct_9fa48('310')
                  ? {}
                  : (stryCov_9fa48('310'),
                    {
                      name: input.name,
                    })
              );
              return reply
                .status(201)
                .header(
                  stryMutAct_9fa48('311') ? '' : (stryCov_9fa48('311'), 'HX-Redirect'),
                  stryMutAct_9fa48('312') ? '' : (stryCov_9fa48('312'), '/admin/templates')
                );
            }
          } catch (e) {
            if (stryMutAct_9fa48('313')) {
              {
              }
            } else {
              stryCov_9fa48('313');
              if (
                stryMutAct_9fa48('315')
                  ? false
                  : stryMutAct_9fa48('314')
                    ? true
                    : (stryCov_9fa48('314', '315'), e instanceof z.ZodError)
              )
                return reply
                  .status(422)
                  .send(
                    htmlError(
                      stryMutAct_9fa48('316')
                        ? e.issues[0]?.message && 'Validation failed'
                        : (stryCov_9fa48('316'),
                          (stryMutAct_9fa48('317')
                            ? e.issues[0].message
                            : (stryCov_9fa48('317'), e.issues[0]?.message)) ??
                            (stryMutAct_9fa48('318')
                              ? ''
                              : (stryCov_9fa48('318'), 'Validation failed')))
                    )
                  );
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('319')
                    ? ''
                    : (stryCov_9fa48('319'), 'Failed to create template');
              error(
                stryMutAct_9fa48('320')
                  ? ''
                  : (stryCov_9fa48('320'), 'Failed to create admin template'),
                stryMutAct_9fa48('321')
                  ? {}
                  : (stryCov_9fa48('321'),
                    {
                      error: errMsg,
                    })
              );
              return reply.status(500).send(htmlError(errMsg));
            }
          }
        }
      }
    );
    fastify.put(
      stryMutAct_9fa48('322') ? `` : (stryCov_9fa48('322'), `${API_PATH}/templates/:id`),
      stryMutAct_9fa48('323')
        ? {}
        : (stryCov_9fa48('323'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('324')) {
          {
          }
        } else {
          stryCov_9fa48('324');
          const { id } = request.params as {
            id: string;
          };
          try {
            if (stryMutAct_9fa48('325')) {
              {
              }
            } else {
              stryCov_9fa48('325');
              const qp = request.query as Record<string, string | undefined>;
              const body = request.body as Record<string, unknown>;
              const versionRaw = (qp.version ?? body.version) as string | number | undefined;
              const versionParsed = versionSchema.safeParse(
                stryMutAct_9fa48('326')
                  ? {}
                  : (stryCov_9fa48('326'),
                    {
                      version: versionRaw,
                    })
              );
              if (
                stryMutAct_9fa48('329')
                  ? false
                  : stryMutAct_9fa48('328')
                    ? true
                    : stryMutAct_9fa48('327')
                      ? versionParsed.success
                      : (stryCov_9fa48('327', '328', '329'), !versionParsed.success)
              )
                return reply
                  .status(422)
                  .send(
                    htmlError(
                      stryMutAct_9fa48('330')
                        ? ''
                        : (stryCov_9fa48('330'), 'Version number is required')
                    )
                  );
              const content = buildContentFromForm(body);
              const input = updateTemplateSchema.parse(
                stryMutAct_9fa48('331')
                  ? {}
                  : (stryCov_9fa48('331'),
                    {
                      name: body.name,
                      description: body.description,
                      content,
                    })
              );
              await templateRepo.updateWithVersion(
                id,
                versionParsed.data.version,
                stryMutAct_9fa48('332')
                  ? {}
                  : (stryCov_9fa48('332'),
                    {
                      name: input.name,
                      description: input.description,
                      content: input.content as Record<string, unknown>,
                    })
              );
              info(
                stryMutAct_9fa48('333') ? '' : (stryCov_9fa48('333'), 'Admin template updated'),
                stryMutAct_9fa48('334')
                  ? {}
                  : (stryCov_9fa48('334'),
                    {
                      templateId: id,
                    })
              );
              return reply
                .status(200)
                .header(
                  stryMutAct_9fa48('335') ? '' : (stryCov_9fa48('335'), 'HX-Redirect'),
                  stryMutAct_9fa48('336') ? '' : (stryCov_9fa48('336'), '/admin/templates')
                );
            }
          } catch (e) {
            if (stryMutAct_9fa48('337')) {
              {
              }
            } else {
              stryCov_9fa48('337');
              if (
                stryMutAct_9fa48('339')
                  ? false
                  : stryMutAct_9fa48('338')
                    ? true
                    : (stryCov_9fa48('338', '339'), e instanceof z.ZodError)
              )
                return reply
                  .status(422)
                  .send(
                    htmlError(
                      stryMutAct_9fa48('340')
                        ? e.issues[0]?.message && 'Validation failed'
                        : (stryCov_9fa48('340'),
                          (stryMutAct_9fa48('341')
                            ? e.issues[0].message
                            : (stryCov_9fa48('341'), e.issues[0]?.message)) ??
                            (stryMutAct_9fa48('342')
                              ? ''
                              : (stryCov_9fa48('342'), 'Validation failed')))
                    )
                  );
              if (
                stryMutAct_9fa48('345')
                  ? e instanceof Error ||
                    e.message.toLowerCase().includes('record') ||
                    (
                      e as unknown as {
                        code?: string;
                      }
                    ).code === 'P2025'
                  : stryMutAct_9fa48('344')
                    ? false
                    : stryMutAct_9fa48('343')
                      ? true
                      : (stryCov_9fa48('343', '344', '345'),
                        e instanceof Error &&
                          (stryMutAct_9fa48('347')
                            ? e.message.toLowerCase().includes('record') &&
                              (
                                e as unknown as {
                                  code?: string;
                                }
                              ).code === 'P2025'
                            : stryMutAct_9fa48('346')
                              ? true
                              : (stryCov_9fa48('346', '347'),
                                (stryMutAct_9fa48('348')
                                  ? e.message.toUpperCase().includes('record')
                                  : (stryCov_9fa48('348'),
                                    e.message
                                      .toLowerCase()
                                      .includes(
                                        stryMutAct_9fa48('349')
                                          ? ''
                                          : (stryCov_9fa48('349'), 'record')
                                      ))) ||
                                  (stryMutAct_9fa48('351')
                                    ? (
                                        e as unknown as {
                                          code?: string;
                                        }
                                      ).code !== 'P2025'
                                    : stryMutAct_9fa48('350')
                                      ? false
                                      : (stryCov_9fa48('350', '351'),
                                        (
                                          e as unknown as {
                                            code?: string;
                                          }
                                        ).code ===
                                          (stryMutAct_9fa48('352')
                                            ? ''
                                            : (stryCov_9fa48('352'), 'P2025')))))))
              ) {
                if (stryMutAct_9fa48('353')) {
                  {
                  }
                } else {
                  stryCov_9fa48('353');
                  return reply
                    .status(409)
                    .send(
                      stryMutAct_9fa48('354')
                        ? ''
                        : (stryCov_9fa48('354'),
                          '<div class="text-red-600">模板已被他人修改，请刷新后重试</div>')
                    );
                }
              }
              if (
                stryMutAct_9fa48('357')
                  ? e instanceof Error || e.message.includes('find')
                  : stryMutAct_9fa48('356')
                    ? false
                    : stryMutAct_9fa48('355')
                      ? true
                      : (stryCov_9fa48('355', '356', '357'),
                        e instanceof Error &&
                          e.message.includes(
                            stryMutAct_9fa48('358') ? '' : (stryCov_9fa48('358'), 'find')
                          ))
              )
                return reply
                  .status(404)
                  .send(
                    htmlError(
                      stryMutAct_9fa48('359') ? '' : (stryCov_9fa48('359'), 'Template not found')
                    )
                  );
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('360')
                    ? ''
                    : (stryCov_9fa48('360'), 'Failed to update template');
              error(
                stryMutAct_9fa48('361')
                  ? ''
                  : (stryCov_9fa48('361'), 'Failed to update admin template'),
                stryMutAct_9fa48('362')
                  ? {}
                  : (stryCov_9fa48('362'),
                    {
                      error: errMsg,
                      templateId: id,
                    })
              );
              return reply.status(500).send(htmlError(errMsg));
            }
          }
        }
      }
    );
    fastify.delete(
      stryMutAct_9fa48('363') ? `` : (stryCov_9fa48('363'), `${API_PATH}/templates/:id`),
      stryMutAct_9fa48('364')
        ? {}
        : (stryCov_9fa48('364'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('365')) {
          {
          }
        } else {
          stryCov_9fa48('365');
          const { id } = request.params as {
            id: string;
          };
          try {
            if (stryMutAct_9fa48('366')) {
              {
              }
            } else {
              stryCov_9fa48('366');
              const existing = await templateRepo.findById(id);
              if (
                stryMutAct_9fa48('369')
                  ? false
                  : stryMutAct_9fa48('368')
                    ? true
                    : stryMutAct_9fa48('367')
                      ? existing
                      : (stryCov_9fa48('367', '368', '369'), !existing)
              )
                return reply
                  .status(404)
                  .send(
                    htmlError(
                      stryMutAct_9fa48('370') ? '' : (stryCov_9fa48('370'), 'Template not found')
                    )
                  );
              const usageStats = await templateRepo.getUsageStats(id);

              // Check Interview FK constraint
              const totalInterviews = stryMutAct_9fa48('371')
                ? usageStats.interviews.active +
                  usageStats.interviews.pending +
                  usageStats.interviews.waiting +
                  usageStats.interviews.completed -
                  usageStats.interviews.cancelled
                : (stryCov_9fa48('371'),
                  (stryMutAct_9fa48('372')
                    ? usageStats.interviews.active +
                      usageStats.interviews.pending +
                      usageStats.interviews.waiting -
                      usageStats.interviews.completed
                    : (stryCov_9fa48('372'),
                      (stryMutAct_9fa48('373')
                        ? usageStats.interviews.active +
                          usageStats.interviews.pending -
                          usageStats.interviews.waiting
                        : (stryCov_9fa48('373'),
                          (stryMutAct_9fa48('374')
                            ? usageStats.interviews.active - usageStats.interviews.pending
                            : (stryCov_9fa48('374'),
                              usageStats.interviews.active + usageStats.interviews.pending)) +
                            usageStats.interviews.waiting)) + usageStats.interviews.completed)) +
                    usageStats.interviews.cancelled);
              if (
                stryMutAct_9fa48('378')
                  ? totalInterviews <= 0
                  : stryMutAct_9fa48('377')
                    ? totalInterviews >= 0
                    : stryMutAct_9fa48('376')
                      ? false
                      : stryMutAct_9fa48('375')
                        ? true
                        : (stryCov_9fa48('375', '376', '377', '378'), totalInterviews > 0)
              ) {
                if (stryMutAct_9fa48('379')) {
                  {
                  }
                } else {
                  stryCov_9fa48('379');
                  return reply
                    .status(409)
                    .send(
                      stryMutAct_9fa48('380')
                        ? ``
                        : (stryCov_9fa48('380'),
                          `<div class="text-red-600">不能删除：该模板关联了 ${totalInterviews} 个访谈记录</div>`)
                    );
                }
              }

              // Check InterviewPlan FK constraint
              const totalPlans = stryMutAct_9fa48('381')
                ? (usageStats.plans?.running ?? 0) +
                  (usageStats.plans?.pending ?? 0) +
                  (usageStats.plans?.ready ?? 0) +
                  (usageStats.plans?.paused ?? 0) -
                  (usageStats.plans?.completed ?? 0)
                : (stryCov_9fa48('381'),
                  (stryMutAct_9fa48('382')
                    ? (usageStats.plans?.running ?? 0) +
                      (usageStats.plans?.pending ?? 0) +
                      (usageStats.plans?.ready ?? 0) -
                      (usageStats.plans?.paused ?? 0)
                    : (stryCov_9fa48('382'),
                      (stryMutAct_9fa48('383')
                        ? (usageStats.plans?.running ?? 0) +
                          (usageStats.plans?.pending ?? 0) -
                          (usageStats.plans?.ready ?? 0)
                        : (stryCov_9fa48('383'),
                          (stryMutAct_9fa48('384')
                            ? (usageStats.plans?.running ?? 0) - (usageStats.plans?.pending ?? 0)
                            : (stryCov_9fa48('384'),
                              (stryMutAct_9fa48('385')
                                ? usageStats.plans?.running && 0
                                : (stryCov_9fa48('385'),
                                  (stryMutAct_9fa48('386')
                                    ? usageStats.plans.running
                                    : (stryCov_9fa48('386'), usageStats.plans?.running)) ?? 0)) +
                                (stryMutAct_9fa48('387')
                                  ? usageStats.plans?.pending && 0
                                  : (stryCov_9fa48('387'),
                                    (stryMutAct_9fa48('388')
                                      ? usageStats.plans.pending
                                      : (stryCov_9fa48('388'), usageStats.plans?.pending)) ??
                                      0)))) +
                            (stryMutAct_9fa48('389')
                              ? usageStats.plans?.ready && 0
                              : (stryCov_9fa48('389'),
                                (stryMutAct_9fa48('390')
                                  ? usageStats.plans.ready
                                  : (stryCov_9fa48('390'), usageStats.plans?.ready)) ?? 0)))) +
                        (stryMutAct_9fa48('391')
                          ? usageStats.plans?.paused && 0
                          : (stryCov_9fa48('391'),
                            (stryMutAct_9fa48('392')
                              ? usageStats.plans.paused
                              : (stryCov_9fa48('392'), usageStats.plans?.paused)) ?? 0)))) +
                    (stryMutAct_9fa48('393')
                      ? usageStats.plans?.completed && 0
                      : (stryCov_9fa48('393'),
                        (stryMutAct_9fa48('394')
                          ? usageStats.plans.completed
                          : (stryCov_9fa48('394'), usageStats.plans?.completed)) ?? 0)));
              if (
                stryMutAct_9fa48('398')
                  ? totalPlans <= 0
                  : stryMutAct_9fa48('397')
                    ? totalPlans >= 0
                    : stryMutAct_9fa48('396')
                      ? false
                      : stryMutAct_9fa48('395')
                        ? true
                        : (stryCov_9fa48('395', '396', '397', '398'), totalPlans > 0)
              ) {
                if (stryMutAct_9fa48('399')) {
                  {
                  }
                } else {
                  stryCov_9fa48('399');
                  return reply
                    .status(409)
                    .send(
                      stryMutAct_9fa48('400')
                        ? ``
                        : (stryCov_9fa48('400'),
                          `<div class="text-red-600">不能删除：该模板关联了 ${totalPlans} 个访谈计划</div>`)
                    );
                }
              }

              // Bypass repository to avoid stale Prisma instance issues
              await prisma.template.delete(
                stryMutAct_9fa48('401')
                  ? {}
                  : (stryCov_9fa48('401'),
                    {
                      where: stryMutAct_9fa48('402')
                        ? {}
                        : (stryCov_9fa48('402'),
                          {
                            id,
                          }),
                    })
              );
              const verify = await prisma.template.findUnique(
                stryMutAct_9fa48('403')
                  ? {}
                  : (stryCov_9fa48('403'),
                    {
                      where: stryMutAct_9fa48('404')
                        ? {}
                        : (stryCov_9fa48('404'),
                          {
                            id,
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('406')
                  ? false
                  : stryMutAct_9fa48('405')
                    ? true
                    : (stryCov_9fa48('405', '406'), verify)
              ) {
                if (stryMutAct_9fa48('407')) {
                  {
                  }
                } else {
                  stryCov_9fa48('407');
                  error(
                    stryMutAct_9fa48('408')
                      ? ''
                      : (stryCov_9fa48('408'),
                        'Database delete failed: record still exists after delete call'),
                    stryMutAct_9fa48('409')
                      ? {}
                      : (stryCov_9fa48('409'),
                        {
                          templateId: id,
                        })
                  );
                  return reply
                    .status(500)
                    .send(
                      htmlError(
                        stryMutAct_9fa48('410')
                          ? ''
                          : (stryCov_9fa48('410'), '数据库删除失败，记录仍然存在')
                      )
                    );
                }
              }
              info(
                stryMutAct_9fa48('411')
                  ? ''
                  : (stryCov_9fa48('411'), 'Admin template deleted and verified'),
                stryMutAct_9fa48('412')
                  ? {}
                  : (stryCov_9fa48('412'),
                    {
                      templateId: id,
                    })
              );
              return reply.send(
                stryMutAct_9fa48('413')
                  ? ``
                  : (stryCov_9fa48('413'),
                    `
          <div class="text-green-600">模板已删除</div>
          <script>
            // Clear the modal container to close it
            setTimeout(() => {
              const modalContainer = document.getElementById('delete-modal-container');
              if (modalContainer) {
                modalContainer.innerHTML = '';
              }
              // Refresh page to update the tables since row removal is complex with outerHTML 
              location.reload();
            }, 500);
          </script>
        `)
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('414')) {
              {
              }
            } else {
              stryCov_9fa48('414');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('415')
                    ? ''
                    : (stryCov_9fa48('415'), 'Failed to delete template');
              error(
                stryMutAct_9fa48('416')
                  ? ''
                  : (stryCov_9fa48('416'), 'Failed to delete admin template'),
                stryMutAct_9fa48('417')
                  ? {}
                  : (stryCov_9fa48('417'),
                    {
                      error: errMsg,
                      templateId: id,
                    })
              );
              return reply.status(500).send(htmlError(errMsg));
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('418') ? `` : (stryCov_9fa48('418'), `${API_PATH}/templates/:id/usage`),
      stryMutAct_9fa48('419')
        ? {}
        : (stryCov_9fa48('419'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('420')) {
          {
          }
        } else {
          stryCov_9fa48('420');
          try {
            if (stryMutAct_9fa48('421')) {
              {
              }
            } else {
              stryCov_9fa48('421');
              return await templateRepo.getUsageStats(
                (
                  request.params as {
                    id: string;
                  }
                ).id
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('422')) {
              {
              }
            } else {
              stryCov_9fa48('422');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('423')
                    ? ''
                    : (stryCov_9fa48('423'), 'Failed');
              return reply.status(500).send(
                stryMutAct_9fa48('424')
                  ? {}
                  : (stryCov_9fa48('424'),
                    {
                      error: errMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('425') ? `` : (stryCov_9fa48('425'), `${API_PATH}/templates`),
      stryMutAct_9fa48('426')
        ? {}
        : (stryCov_9fa48('426'),
          {
            preHandler: adminAuth,
          }),
      async (_r: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('427')) {
          {
          }
        } else {
          stryCov_9fa48('427');
          try {
            if (stryMutAct_9fa48('428')) {
              {
              }
            } else {
              stryCov_9fa48('428');
              const qp = (_r.query as Record<string, string | undefined>).page;
              const page = qp
                ? stryMutAct_9fa48('429')
                  ? Math.min(1, Number.parseInt(qp, 10))
                  : (stryCov_9fa48('429'), Math.max(1, Number.parseInt(qp, 10)))
                : 1;
              const result = await templateRepo.findAllPaginated(page, 20);
              const rows = result.items
                .map(
                  stryMutAct_9fa48('430')
                    ? () => undefined
                    : (stryCov_9fa48('430'),
                      (t) =>
                        stryMutAct_9fa48('431')
                          ? ``
                          : (stryCov_9fa48('431'),
                            `<tr><td>${htmlEscape(t.id)}</td><td>${htmlEscape(t.name)}</td><td>${t.status}</td><td>v${t.version}</td></tr>`))
                )
                .join(stryMutAct_9fa48('432') ? '' : (stryCov_9fa48('432'), '\n'));
              return reply
                .type(stryMutAct_9fa48('433') ? '' : (stryCov_9fa48('433'), 'text/html'))
                .send(rows);
            }
          } catch (e) {
            if (stryMutAct_9fa48('434')) {
              {
              }
            } else {
              stryCov_9fa48('434');
              return reply
                .status(500)
                .send(
                  htmlError(
                    e instanceof Error
                      ? e.message
                      : stryMutAct_9fa48('435')
                        ? ''
                        : (stryCov_9fa48('435'), 'Failed')
                  )
                );
            }
          }
        }
      }
    );

    // GET /admin/templates/:id - Template detail page
    fastify.get(
      stryMutAct_9fa48('436') ? `` : (stryCov_9fa48('436'), `${BASE_PATH}/templates/:id`),
      stryMutAct_9fa48('437')
        ? {}
        : (stryCov_9fa48('437'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('438')) {
          {
          }
        } else {
          stryCov_9fa48('438');
          const { id } = request.params as {
            id: string;
          };
          try {
            if (stryMutAct_9fa48('439')) {
              {
              }
            } else {
              stryCov_9fa48('439');
              const template = await prisma.template.findUnique(
                stryMutAct_9fa48('440')
                  ? {}
                  : (stryCov_9fa48('440'),
                    {
                      where: stryMutAct_9fa48('441')
                        ? {}
                        : (stryCov_9fa48('441'),
                          {
                            id,
                          }),
                      include: stryMutAct_9fa48('442')
                        ? {}
                        : (stryCov_9fa48('442'),
                          {
                            _count: stryMutAct_9fa48('443')
                              ? {}
                              : (stryCov_9fa48('443'),
                                {
                                  select: stryMutAct_9fa48('444')
                                    ? {}
                                    : (stryCov_9fa48('444'),
                                      {
                                        interviewPlans: stryMutAct_9fa48('445')
                                          ? false
                                          : (stryCov_9fa48('445'), true),
                                        interviews: stryMutAct_9fa48('446')
                                          ? false
                                          : (stryCov_9fa48('446'), true),
                                      }),
                                }),
                            interviewPlans: stryMutAct_9fa48('447')
                              ? {}
                              : (stryCov_9fa48('447'),
                                {
                                  orderBy: stryMutAct_9fa48('448')
                                    ? {}
                                    : (stryCov_9fa48('448'),
                                      {
                                        createdAt: stryMutAct_9fa48('449')
                                          ? ''
                                          : (stryCov_9fa48('449'), 'desc'),
                                      }),
                                  take: 20,
                                  select: stryMutAct_9fa48('450')
                                    ? {}
                                    : (stryCov_9fa48('450'),
                                      {
                                        id: stryMutAct_9fa48('451')
                                          ? false
                                          : (stryCov_9fa48('451'), true),
                                        name: stryMutAct_9fa48('452')
                                          ? false
                                          : (stryCov_9fa48('452'), true),
                                        status: stryMutAct_9fa48('453')
                                          ? false
                                          : (stryCov_9fa48('453'), true),
                                        completedCount: stryMutAct_9fa48('454')
                                          ? false
                                          : (stryCov_9fa48('454'), true),
                                        sentCount: stryMutAct_9fa48('455')
                                          ? false
                                          : (stryCov_9fa48('455'), true),
                                        createdAt: stryMutAct_9fa48('456')
                                          ? false
                                          : (stryCov_9fa48('456'), true),
                                      }),
                                }),
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('459')
                  ? false
                  : stryMutAct_9fa48('458')
                    ? true
                    : stryMutAct_9fa48('457')
                      ? template
                      : (stryCov_9fa48('457', '458', '459'), !template)
              )
                return reply
                  .status(404)
                  .type(stryMutAct_9fa48('460') ? '' : (stryCov_9fa48('460'), 'text/html'))
                  .send(stryMutAct_9fa48('461') ? '' : (stryCov_9fa48('461'), '模板不存在'));
              const content = JSON.parse(template.content || '{}') as Record<string, unknown>;
              const plans = template.interviewPlans;
              return reply.view(
                stryMutAct_9fa48('462') ? '' : (stryCov_9fa48('462'), 'templates/detail.njk'),
                stryMutAct_9fa48('463')
                  ? {}
                  : (stryCov_9fa48('463'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      template,
                      content,
                      plans,
                      planCount: template._count.interviewPlans,
                      interviewCount: template._count.interviews,
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('464')) {
              {
              }
            } else {
              stryCov_9fa48('464');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('465')
                    ? ''
                    : (stryCov_9fa48('465'), 'Failed to load template detail');
              error(
                stryMutAct_9fa48('466')
                  ? ''
                  : (stryCov_9fa48('466'), 'Failed to load template detail'),
                stryMutAct_9fa48('467')
                  ? {}
                  : (stryCov_9fa48('467'),
                    {
                      error: errMsg,
                      templateId: id,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('468') ? '' : (stryCov_9fa48('468'), 'error.njk'),
                stryMutAct_9fa48('469')
                  ? {}
                  : (stryCov_9fa48('469'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );

    // GET /admin/api/templates/:id/stats - Usage statistics JSON
    fastify.get(
      stryMutAct_9fa48('470') ? `` : (stryCov_9fa48('470'), `${API_PATH}/templates/:id/stats`),
      stryMutAct_9fa48('471')
        ? {}
        : (stryCov_9fa48('471'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('472')) {
          {
          }
        } else {
          stryCov_9fa48('472');
          const { id } = request.params as {
            id: string;
          };
          try {
            if (stryMutAct_9fa48('473')) {
              {
              }
            } else {
              stryCov_9fa48('473');
              const interviews = await prisma.interview.groupBy(
                stryMutAct_9fa48('474')
                  ? {}
                  : (stryCov_9fa48('474'),
                    {
                      by: stryMutAct_9fa48('475')
                        ? []
                        : (stryCov_9fa48('475'),
                          [stryMutAct_9fa48('476') ? '' : (stryCov_9fa48('476'), 'status')]),
                      where: stryMutAct_9fa48('477')
                        ? {}
                        : (stryCov_9fa48('477'),
                          {
                            templateId: id,
                          }),
                      _count: stryMutAct_9fa48('478') ? false : (stryCov_9fa48('478'), true),
                    })
              );
              const plans = await prisma.interviewPlan.groupBy(
                stryMutAct_9fa48('479')
                  ? {}
                  : (stryCov_9fa48('479'),
                    {
                      by: stryMutAct_9fa48('480')
                        ? []
                        : (stryCov_9fa48('480'),
                          [stryMutAct_9fa48('481') ? '' : (stryCov_9fa48('481'), 'status')]),
                      where: stryMutAct_9fa48('482')
                        ? {}
                        : (stryCov_9fa48('482'),
                          {
                            templateId: id,
                          }),
                      _count: stryMutAct_9fa48('483') ? false : (stryCov_9fa48('483'), true),
                    })
              );
              return reply.send(
                stryMutAct_9fa48('484')
                  ? {}
                  : (stryCov_9fa48('484'),
                    {
                      interviews: Object.fromEntries(
                        interviews.map(
                          stryMutAct_9fa48('485')
                            ? () => undefined
                            : (stryCov_9fa48('485'),
                              (i) =>
                                stryMutAct_9fa48('486')
                                  ? []
                                  : (stryCov_9fa48('486'), [i.status, i._count]))
                        )
                      ),
                      plans: Object.fromEntries(
                        plans.map(
                          stryMutAct_9fa48('487')
                            ? () => undefined
                            : (stryCov_9fa48('487'),
                              (p) =>
                                stryMutAct_9fa48('488')
                                  ? []
                                  : (stryCov_9fa48('488'), [p.status, p._count]))
                        )
                      ),
                      totalInterviews: interviews.reduce(
                        stryMutAct_9fa48('489')
                          ? () => undefined
                          : (stryCov_9fa48('489'),
                            (sum: number, i) =>
                              stryMutAct_9fa48('490')
                                ? sum - (i._count as number)
                                : (stryCov_9fa48('490'), sum + (i._count as number))),
                        0
                      ),
                      totalPlans: plans.reduce(
                        stryMutAct_9fa48('491')
                          ? () => undefined
                          : (stryCov_9fa48('491'),
                            (sum: number, p) =>
                              stryMutAct_9fa48('492')
                                ? sum - (p._count as number)
                                : (stryCov_9fa48('492'), sum + (p._count as number))),
                        0
                      ),
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('493')) {
              {
              }
            } else {
              stryCov_9fa48('493');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('494')
                    ? ''
                    : (stryCov_9fa48('494'), 'Failed');
              return reply.status(500).send(
                stryMutAct_9fa48('495')
                  ? {}
                  : (stryCov_9fa48('495'),
                    {
                      error: errMsg,
                    })
              );
            }
          }
        }
      }
    );

    // GET /admin/plans/:id - Plan detail page
    fastify.get(
      stryMutAct_9fa48('496') ? `` : (stryCov_9fa48('496'), `${BASE_PATH}/plans/:id`),
      stryMutAct_9fa48('497')
        ? {}
        : (stryCov_9fa48('497'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('498')) {
          {
          }
        } else {
          stryCov_9fa48('498');
          const { id } = request.params as {
            id: string;
          };
          try {
            if (stryMutAct_9fa48('499')) {
              {
              }
            } else {
              stryCov_9fa48('499');
              const plan = await prisma.interviewPlan.findUnique(
                stryMutAct_9fa48('500')
                  ? {}
                  : (stryCov_9fa48('500'),
                    {
                      where: stryMutAct_9fa48('501')
                        ? {}
                        : (stryCov_9fa48('501'),
                          {
                            id,
                          }),
                      include: stryMutAct_9fa48('502')
                        ? {}
                        : (stryCov_9fa48('502'),
                          {
                            template: stryMutAct_9fa48('503')
                              ? {}
                              : (stryCov_9fa48('503'),
                                {
                                  select: stryMutAct_9fa48('504')
                                    ? {}
                                    : (stryCov_9fa48('504'),
                                      {
                                        id: stryMutAct_9fa48('505')
                                          ? false
                                          : (stryCov_9fa48('505'), true),
                                        name: stryMutAct_9fa48('506')
                                          ? false
                                          : (stryCov_9fa48('506'), true),
                                      }),
                                }),
                            interviews: stryMutAct_9fa48('507')
                              ? {}
                              : (stryCov_9fa48('507'),
                                {
                                  orderBy: stryMutAct_9fa48('508')
                                    ? {}
                                    : (stryCov_9fa48('508'),
                                      {
                                        createdAt: stryMutAct_9fa48('509')
                                          ? ''
                                          : (stryCov_9fa48('509'), 'desc'),
                                      }),
                                  select: stryMutAct_9fa48('510')
                                    ? {}
                                    : (stryCov_9fa48('510'),
                                      {
                                        id: stryMutAct_9fa48('511')
                                          ? false
                                          : (stryCov_9fa48('511'), true),
                                        userId: stryMutAct_9fa48('512')
                                          ? false
                                          : (stryCov_9fa48('512'), true),
                                        status: stryMutAct_9fa48('513')
                                          ? false
                                          : (stryCov_9fa48('513'), true),
                                        createdAt: stryMutAct_9fa48('514')
                                          ? false
                                          : (stryCov_9fa48('514'), true),
                                        updatedAt: stryMutAct_9fa48('515')
                                          ? false
                                          : (stryCov_9fa48('515'), true),
                                      }),
                                }),
                            _count: stryMutAct_9fa48('516')
                              ? {}
                              : (stryCov_9fa48('516'),
                                {
                                  select: stryMutAct_9fa48('517')
                                    ? {}
                                    : (stryCov_9fa48('517'),
                                      {
                                        interviews: stryMutAct_9fa48('518')
                                          ? false
                                          : (stryCov_9fa48('518'), true),
                                      }),
                                }),
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('521')
                  ? false
                  : stryMutAct_9fa48('520')
                    ? true
                    : stryMutAct_9fa48('519')
                      ? plan
                      : (stryCov_9fa48('519', '520', '521'), !plan)
              )
                return reply
                  .status(404)
                  .type(stryMutAct_9fa48('522') ? '' : (stryCov_9fa48('522'), 'text/html'))
                  .send(stryMutAct_9fa48('523') ? '' : (stryCov_9fa48('523'), '计划不存在'));
              const completedCount = stryMutAct_9fa48('524')
                ? plan.interviews.length
                : (stryCov_9fa48('524'),
                  plan.interviews.filter(
                    stryMutAct_9fa48('525')
                      ? () => undefined
                      : (stryCov_9fa48('525'),
                        (i) =>
                          stryMutAct_9fa48('528')
                            ? i.status !== 'COMPLETED'
                            : stryMutAct_9fa48('527')
                              ? false
                              : stryMutAct_9fa48('526')
                                ? true
                                : (stryCov_9fa48('526', '527', '528'),
                                  i.status ===
                                    (stryMutAct_9fa48('529')
                                      ? ''
                                      : (stryCov_9fa48('529'), 'COMPLETED'))))
                  ).length);
              return reply.view(
                stryMutAct_9fa48('530') ? '' : (stryCov_9fa48('530'), 'plans/detail.njk'),
                stryMutAct_9fa48('531')
                  ? {}
                  : (stryCov_9fa48('531'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      plan,
                      template: plan.template,
                      interviews: plan.interviews,
                      totalInterviews: plan._count.interviews,
                      completedCount,
                      completionRate: (
                        stryMutAct_9fa48('535')
                          ? plan.sentCount <= 0
                          : stryMutAct_9fa48('534')
                            ? plan.sentCount >= 0
                            : stryMutAct_9fa48('533')
                              ? false
                              : stryMutAct_9fa48('532')
                                ? true
                                : (stryCov_9fa48('532', '533', '534', '535'), plan.sentCount > 0)
                      )
                        ? Math.round(
                            stryMutAct_9fa48('536')
                              ? completedCount / plan.sentCount / 100
                              : (stryCov_9fa48('536'),
                                (stryMutAct_9fa48('537')
                                  ? completedCount * plan.sentCount
                                  : (stryCov_9fa48('537'), completedCount / plan.sentCount)) * 100)
                          )
                        : 0,
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('538')) {
              {
              }
            } else {
              stryCov_9fa48('538');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('539')
                    ? ''
                    : (stryCov_9fa48('539'), 'Failed to load plan detail');
              error(
                stryMutAct_9fa48('540') ? '' : (stryCov_9fa48('540'), 'Failed to load plan detail'),
                stryMutAct_9fa48('541')
                  ? {}
                  : (stryCov_9fa48('541'),
                    {
                      error: errMsg,
                      planId: id,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('542') ? '' : (stryCov_9fa48('542'), 'error.njk'),
                stryMutAct_9fa48('543')
                  ? {}
                  : (stryCov_9fa48('543'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );

    // GET /admin/analytics - Analytics dashboard placeholder
    fastify.get(
      stryMutAct_9fa48('544') ? `` : (stryCov_9fa48('544'), `${BASE_PATH}/analytics`),
      stryMutAct_9fa48('545')
        ? {}
        : (stryCov_9fa48('545'),
          {
            preHandler: adminAuth,
          }),
      async (_r: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('546')) {
          {
          }
        } else {
          stryCov_9fa48('546');
          try {
            if (stryMutAct_9fa48('547')) {
              {
              }
            } else {
              stryCov_9fa48('547');
              const [templates, plans] = await Promise.all(
                stryMutAct_9fa48('548')
                  ? []
                  : (stryCov_9fa48('548'),
                    [
                      prisma.template.findMany(
                        stryMutAct_9fa48('549')
                          ? {}
                          : (stryCov_9fa48('549'),
                            {
                              select: stryMutAct_9fa48('550')
                                ? {}
                                : (stryCov_9fa48('550'),
                                  {
                                    id: stryMutAct_9fa48('551')
                                      ? false
                                      : (stryCov_9fa48('551'), true),
                                    name: stryMutAct_9fa48('552')
                                      ? false
                                      : (stryCov_9fa48('552'), true),
                                  }),
                            })
                      ),
                      prisma.interviewPlan.findMany(
                        stryMutAct_9fa48('553')
                          ? {}
                          : (stryCov_9fa48('553'),
                            {
                              select: stryMutAct_9fa48('554')
                                ? {}
                                : (stryCov_9fa48('554'),
                                  {
                                    id: stryMutAct_9fa48('555')
                                      ? false
                                      : (stryCov_9fa48('555'), true),
                                    name: stryMutAct_9fa48('556')
                                      ? false
                                      : (stryCov_9fa48('556'), true),
                                  }),
                            })
                      ),
                    ])
              );
              return reply.view(
                stryMutAct_9fa48('557') ? '' : (stryCov_9fa48('557'), 'analytics/index.njk'),
                stryMutAct_9fa48('558')
                  ? {}
                  : (stryCov_9fa48('558'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      templates,
                      plans,
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('559')) {
              {
              }
            } else {
              stryCov_9fa48('559');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('560')
                    ? ''
                    : (stryCov_9fa48('560'), 'Failed to load analytics');
              error(
                stryMutAct_9fa48('561') ? '' : (stryCov_9fa48('561'), 'Failed to load analytics'),
                stryMutAct_9fa48('562')
                  ? {}
                  : (stryCov_9fa48('562'),
                    {
                      error: errMsg,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('563') ? '' : (stryCov_9fa48('563'), 'error.njk'),
                stryMutAct_9fa48('564')
                  ? {}
                  : (stryCov_9fa48('564'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('565') ? `` : (stryCov_9fa48('565'), `${BASE_PATH}/plans`),
      stryMutAct_9fa48('566')
        ? {}
        : (stryCov_9fa48('566'),
          {
            preHandler: adminAuth,
          }),
      async (_r: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('567')) {
          {
          }
        } else {
          stryCov_9fa48('567');
          try {
            if (stryMutAct_9fa48('568')) {
              {
              }
            } else {
              stryCov_9fa48('568');
              const plans = await prisma.interviewPlan.findMany(
                stryMutAct_9fa48('569')
                  ? {}
                  : (stryCov_9fa48('569'),
                    {
                      orderBy: stryMutAct_9fa48('570')
                        ? {}
                        : (stryCov_9fa48('570'),
                          {
                            createdAt: stryMutAct_9fa48('571')
                              ? ''
                              : (stryCov_9fa48('571'), 'desc'),
                          }),
                      include: stryMutAct_9fa48('572')
                        ? {}
                        : (stryCov_9fa48('572'),
                          {
                            template: stryMutAct_9fa48('573')
                              ? {}
                              : (stryCov_9fa48('573'),
                                {
                                  select: stryMutAct_9fa48('574')
                                    ? {}
                                    : (stryCov_9fa48('574'),
                                      {
                                        id: stryMutAct_9fa48('575')
                                          ? false
                                          : (stryCov_9fa48('575'), true),
                                        name: stryMutAct_9fa48('576')
                                          ? false
                                          : (stryCov_9fa48('576'), true),
                                      }),
                                }),
                            _count: stryMutAct_9fa48('577')
                              ? {}
                              : (stryCov_9fa48('577'),
                                {
                                  select: stryMutAct_9fa48('578')
                                    ? {}
                                    : (stryCov_9fa48('578'),
                                      {
                                        interviews: stryMutAct_9fa48('579')
                                          ? false
                                          : (stryCov_9fa48('579'), true),
                                      }),
                                }),
                          }),
                    })
              );
              return reply.view(
                stryMutAct_9fa48('580') ? '' : (stryCov_9fa48('580'), 'plans/index.njk'),
                stryMutAct_9fa48('581')
                  ? {}
                  : (stryCov_9fa48('581'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      plans: plans.map(
                        stryMutAct_9fa48('582')
                          ? () => undefined
                          : (stryCov_9fa48('582'),
                            (p) =>
                              stryMutAct_9fa48('583')
                                ? {}
                                : (stryCov_9fa48('583'),
                                  {
                                    id: p.id,
                                    name: p.name,
                                    description: p.description,
                                    status: p.status,
                                    templateName: stryMutAct_9fa48('584')
                                      ? p.template?.name && '-'
                                      : (stryCov_9fa48('584'),
                                        (stryMutAct_9fa48('585')
                                          ? p.template.name
                                          : (stryCov_9fa48('585'), p.template?.name)) ??
                                          (stryMutAct_9fa48('586')
                                            ? ''
                                            : (stryCov_9fa48('586'), '-'))),
                                    interviewCount: p._count.interviews,
                                    createdAtFormatted: fmtDate(p.createdAt),
                                  }))
                      ),
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('587')) {
              {
              }
            } else {
              stryCov_9fa48('587');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('588')
                    ? ''
                    : (stryCov_9fa48('588'), 'Failed to load plans');
              error(
                stryMutAct_9fa48('589') ? '' : (stryCov_9fa48('589'), 'Failed to load admin plans'),
                stryMutAct_9fa48('590')
                  ? {}
                  : (stryCov_9fa48('590'),
                    {
                      error: errMsg,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('591') ? '' : (stryCov_9fa48('591'), 'error.njk'),
                stryMutAct_9fa48('592')
                  ? {}
                  : (stryCov_9fa48('592'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('593') ? `` : (stryCov_9fa48('593'), `${BASE_PATH}/reports`),
      stryMutAct_9fa48('594')
        ? {}
        : (stryCov_9fa48('594'),
          {
            preHandler: adminAuth,
          }),
      async (_r: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('595')) {
          {
          }
        } else {
          stryCov_9fa48('595');
          try {
            if (stryMutAct_9fa48('596')) {
              {
              }
            } else {
              stryCov_9fa48('596');
              const reports = await prisma.analysisReport.findMany(
                stryMutAct_9fa48('597')
                  ? {}
                  : (stryCov_9fa48('597'),
                    {
                      orderBy: stryMutAct_9fa48('598')
                        ? {}
                        : (stryCov_9fa48('598'),
                          {
                            createdAt: stryMutAct_9fa48('599')
                              ? ''
                              : (stryCov_9fa48('599'), 'desc'),
                          }),
                      take: 100,
                      include: stryMutAct_9fa48('600')
                        ? {}
                        : (stryCov_9fa48('600'),
                          {
                            interview: stryMutAct_9fa48('601')
                              ? {}
                              : (stryCov_9fa48('601'),
                                {
                                  select: stryMutAct_9fa48('602')
                                    ? {}
                                    : (stryCov_9fa48('602'),
                                      {
                                        id: stryMutAct_9fa48('603')
                                          ? false
                                          : (stryCov_9fa48('603'), true),
                                        userId: stryMutAct_9fa48('604')
                                          ? false
                                          : (stryCov_9fa48('604'), true),
                                        status: stryMutAct_9fa48('605')
                                          ? false
                                          : (stryCov_9fa48('605'), true),
                                      }),
                                }),
                          }),
                    })
              );
              return reply.view(
                stryMutAct_9fa48('606') ? '' : (stryCov_9fa48('606'), 'reports/index.njk'),
                stryMutAct_9fa48('607')
                  ? {}
                  : (stryCov_9fa48('607'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      reports: reports.map(
                        stryMutAct_9fa48('608')
                          ? () => undefined
                          : (stryCov_9fa48('608'),
                            (r) =>
                              stryMutAct_9fa48('609')
                                ? {}
                                : (stryCov_9fa48('609'),
                                  {
                                    interviewId: r.interviewId,
                                    userId: stryMutAct_9fa48('610')
                                      ? r.interview?.userId && '-'
                                      : (stryCov_9fa48('610'),
                                        (stryMutAct_9fa48('611')
                                          ? r.interview.userId
                                          : (stryCov_9fa48('611'), r.interview?.userId)) ??
                                          (stryMutAct_9fa48('612')
                                            ? ''
                                            : (stryCov_9fa48('612'), '-'))),
                                    status: stryMutAct_9fa48('613')
                                      ? r.interview?.status && '-'
                                      : (stryCov_9fa48('613'),
                                        (stryMutAct_9fa48('614')
                                          ? r.interview.status
                                          : (stryCov_9fa48('614'), r.interview?.status)) ??
                                          (stryMutAct_9fa48('615')
                                            ? ''
                                            : (stryCov_9fa48('615'), '-'))),
                                    sentiment: stryMutAct_9fa48('616')
                                      ? r.sentiment && ''
                                      : (stryCov_9fa48('616'),
                                        r.sentiment ??
                                          (stryMutAct_9fa48('617')
                                            ? 'Stryker was here!'
                                            : (stryCov_9fa48('617'), ''))),
                                    createdAtFormatted: fmtDate(r.createdAt),
                                  }))
                      ),
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('618')) {
              {
              }
            } else {
              stryCov_9fa48('618');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('619')
                    ? ''
                    : (stryCov_9fa48('619'), 'Failed to load reports');
              error(
                stryMutAct_9fa48('620')
                  ? ''
                  : (stryCov_9fa48('620'), 'Failed to load admin reports'),
                stryMutAct_9fa48('621')
                  ? {}
                  : (stryCov_9fa48('621'),
                    {
                      error: errMsg,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('622') ? '' : (stryCov_9fa48('622'), 'error.njk'),
                stryMutAct_9fa48('623')
                  ? {}
                  : (stryCov_9fa48('623'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('624') ? `` : (stryCov_9fa48('624'), `${BASE_PATH}/reports/:interviewId`),
      stryMutAct_9fa48('625')
        ? {}
        : (stryCov_9fa48('625'),
          {
            preHandler: adminAuth,
          }),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (stryMutAct_9fa48('626')) {
          {
          }
        } else {
          stryCov_9fa48('626');
          const { interviewId } = request.params as {
            interviewId: string;
          };
          try {
            if (stryMutAct_9fa48('627')) {
              {
              }
            } else {
              stryCov_9fa48('627');
              const report = await prisma.analysisReport.findFirst(
                stryMutAct_9fa48('628')
                  ? {}
                  : (stryCov_9fa48('628'),
                    {
                      where: stryMutAct_9fa48('629')
                        ? {}
                        : (stryCov_9fa48('629'),
                          {
                            interviewId,
                          }),
                      orderBy: stryMutAct_9fa48('630')
                        ? {}
                        : (stryCov_9fa48('630'),
                          {
                            createdAt: stryMutAct_9fa48('631')
                              ? ''
                              : (stryCov_9fa48('631'), 'desc'),
                          }),
                    })
              );
              const interview = await prisma.interview.findUnique(
                stryMutAct_9fa48('632')
                  ? {}
                  : (stryCov_9fa48('632'),
                    {
                      where: stryMutAct_9fa48('633')
                        ? {}
                        : (stryCov_9fa48('633'),
                          {
                            id: interviewId,
                          }),
                      select: stryMutAct_9fa48('634')
                        ? {}
                        : (stryCov_9fa48('634'),
                          {
                            id: stryMutAct_9fa48('635') ? false : (stryCov_9fa48('635'), true),
                            userId: stryMutAct_9fa48('636') ? false : (stryCov_9fa48('636'), true),
                            status: stryMutAct_9fa48('637') ? false : (stryCov_9fa48('637'), true),
                            createdAt: stryMutAct_9fa48('638')
                              ? false
                              : (stryCov_9fa48('638'), true),
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('641')
                  ? false
                  : stryMutAct_9fa48('640')
                    ? true
                    : stryMutAct_9fa48('639')
                      ? interview
                      : (stryCov_9fa48('639', '640', '641'), !interview)
              )
                return reply.status(404).view(
                  stryMutAct_9fa48('642') ? '' : (stryCov_9fa48('642'), 'error.njk'),
                  stryMutAct_9fa48('643')
                    ? {}
                    : (stryCov_9fa48('643'),
                      {
                        message: stryMutAct_9fa48('644')
                          ? ''
                          : (stryCov_9fa48('644'), 'Interview not found'),
                      })
                );
              return reply.view(
                stryMutAct_9fa48('645') ? '' : (stryCov_9fa48('645'), 'reports/detail.njk'),
                stryMutAct_9fa48('646')
                  ? {}
                  : (stryCov_9fa48('646'),
                    {
                      adminApiKey: ADMIN_API_KEY,
                      interview: stryMutAct_9fa48('647')
                        ? {}
                        : (stryCov_9fa48('647'),
                          {
                            ...interview,
                            createdAtFormatted: fmtDate(interview.createdAt),
                          }),
                      report: report
                        ? stryMutAct_9fa48('648')
                          ? {}
                          : (stryCov_9fa48('648'),
                            {
                              ...report,
                              createdAtFormatted: fmtDate(
                                (
                                  report as {
                                    createdAt?: Date;
                                  }
                                ).createdAt
                              ),
                            })
                        : null,
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('649')) {
              {
              }
            } else {
              stryCov_9fa48('649');
              const errMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('650')
                    ? ''
                    : (stryCov_9fa48('650'), 'Failed to load report');
              error(
                stryMutAct_9fa48('651')
                  ? ''
                  : (stryCov_9fa48('651'), 'Failed to load report detail'),
                stryMutAct_9fa48('652')
                  ? {}
                  : (stryCov_9fa48('652'),
                    {
                      error: errMsg,
                      interviewId,
                    })
              );
              return reply.status(500).view(
                stryMutAct_9fa48('653') ? '' : (stryCov_9fa48('653'), 'error.njk'),
                stryMutAct_9fa48('654')
                  ? {}
                  : (stryCov_9fa48('654'),
                    {
                      message: errMsg,
                    })
              );
            }
          }
        }
      }
    );
  }
}
