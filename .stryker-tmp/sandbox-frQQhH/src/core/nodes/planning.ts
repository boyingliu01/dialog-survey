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
import { TemplateRepository } from '../../repositories/template.repository.js';
import { InterviewState, NodeOutput } from '../types/index.js';
export interface TemplateContent {
  name: string;
  description?: string;
  invitationPrompt: string;
  questions: string[];
  dimensions?: Array<{
    id: string;
    label: string;
    keywords?: string[];
  }>;
  analysisConfig?: Record<string, unknown>;
}
export async function planningNode(
  state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  if (stryMutAct_9fa48('142')) {
    {
    }
  } else {
    stryCov_9fa48('142');
    const content = await loadTemplateContent(state.templateId);
    const firstQuestion = content.questions[0];
    const greeting = content.invitationPrompt;
    return stryMutAct_9fa48('143')
      ? {}
      : (stryCov_9fa48('143'),
        {
          status: stryMutAct_9fa48('144') ? '' : (stryCov_9fa48('144'), 'ACTIVE'),
          currentQuestion: 0,
          messages: stryMutAct_9fa48('145')
            ? []
            : (stryCov_9fa48('145'),
              [
                ...state.messages,
                stryMutAct_9fa48('146')
                  ? {}
                  : (stryCov_9fa48('146'),
                    {
                      role: stryMutAct_9fa48('147') ? '' : (stryCov_9fa48('147'), 'assistant'),
                      content: greeting,
                      timestamp: new Date(),
                    }),
              ]),
          response: stryMutAct_9fa48('148')
            ? ``
            : (stryCov_9fa48('148'), `${greeting}\n\n${firstQuestion}`),
          shouldContinue: stryMutAct_9fa48('149') ? false : (stryCov_9fa48('149'), true),
        });
  }
}
async function loadTemplateContent(templateId?: string): Promise<TemplateContent> {
  if (stryMutAct_9fa48('150')) {
    {
    }
  } else {
    stryCov_9fa48('150');
    const repo = new TemplateRepository();
    if (
      stryMutAct_9fa48('152')
        ? false
        : stryMutAct_9fa48('151')
          ? true
          : (stryCov_9fa48('151', '152'), templateId)
    ) {
      if (stryMutAct_9fa48('153')) {
        {
        }
      } else {
        stryCov_9fa48('153');
        const template = await repo.findById(templateId);
        if (
          stryMutAct_9fa48('155')
            ? false
            : stryMutAct_9fa48('154')
              ? true
              : (stryCov_9fa48('154', '155'), template)
        ) {
          if (stryMutAct_9fa48('156')) {
            {
            }
          } else {
            stryCov_9fa48('156');
            return JSON.parse(template.content) as TemplateContent;
          }
        }
      }
    }
    return stryMutAct_9fa48('157')
      ? {}
      : (stryCov_9fa48('157'),
        {
          name: stryMutAct_9fa48('158') ? '' : (stryCov_9fa48('158'), 'Default Interview'),
          invitationPrompt: stryMutAct_9fa48('159')
            ? ''
            : (stryCov_9fa48('159'),
              '您好！欢迎参与本次访谈。您的回答对我们非常重要，请根据提示回答问题即可。'),
          questions: stryMutAct_9fa48('160')
            ? []
            : (stryCov_9fa48('160'),
              [
                stryMutAct_9fa48('161')
                  ? ''
                  : (stryCov_9fa48('161'), '请简单介绍一下您的工作经历？'),
                stryMutAct_9fa48('162')
                  ? ''
                  : (stryCov_9fa48('162'), '您在工作中遇到过最大的挑战是什么？'),
                stryMutAct_9fa48('163') ? '' : (stryCov_9fa48('163'), '您是如何解决这个挑战的？'),
                stryMutAct_9fa48('164') ? '' : (stryCov_9fa48('164'), '您对未来的职业规划是什么？'),
              ]),
        });
  }
}
