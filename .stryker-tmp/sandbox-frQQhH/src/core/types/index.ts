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
import { z } from 'zod';

/**
 * InterviewState - 多轮对话完整状态
 *
 * 关键字段说明:
 * - version: 当前数据库版本号 (每次保存后更新)
 * - originalVersion: 加载时的版本号 (用于乐观锁检查，不应被 LangGraph 节点修改)
 * - pendingMessages: 待保存的消息列表 (事务提交前累积)
 * - pendingResponses: 待保存的回复列表 (事务提交前累积)
 */
export const InterviewStateSchema = z.object(
  stryMutAct_9fa48('165')
    ? {}
    : (stryCov_9fa48('165'),
      {
        userId: z.string(),
        templateId: z.string().optional(),
        interviewId: z.string().optional(),
        status: z
          .enum(
            stryMutAct_9fa48('166')
              ? []
              : (stryCov_9fa48('166'),
                [
                  stryMutAct_9fa48('167') ? '' : (stryCov_9fa48('167'), 'PENDING'),
                  stryMutAct_9fa48('168') ? '' : (stryCov_9fa48('168'), 'ACTIVE'),
                  stryMutAct_9fa48('169') ? '' : (stryCov_9fa48('169'), 'WAITING'),
                  stryMutAct_9fa48('170') ? '' : (stryCov_9fa48('170'), 'COMPLETED'),
                  stryMutAct_9fa48('171') ? '' : (stryCov_9fa48('171'), 'CANCELLED'),
                ])
          )
          .default(stryMutAct_9fa48('172') ? '' : (stryCov_9fa48('172'), 'PENDING')),
        userName: z.string().optional(),
        messages: z.array(
          z.object(
            stryMutAct_9fa48('173')
              ? {}
              : (stryCov_9fa48('173'),
                {
                  role: z.enum(
                    stryMutAct_9fa48('174')
                      ? []
                      : (stryCov_9fa48('174'),
                        [
                          stryMutAct_9fa48('175') ? '' : (stryCov_9fa48('175'), 'user'),
                          stryMutAct_9fa48('176') ? '' : (stryCov_9fa48('176'), 'assistant'),
                          stryMutAct_9fa48('177') ? '' : (stryCov_9fa48('177'), 'system'),
                        ])
                  ),
                  content: z.string(),
                  timestamp: z.date().optional(),
                })
          )
        ),
        currentQuestion: z.number().default(0),
        followupCount: z.number().default(0),
        maxFollowups: z.number().default(2),
        responses: z.array(
          z.object(
            stryMutAct_9fa48('178')
              ? {}
              : (stryCov_9fa48('178'),
                {
                  questionId: z.string(),
                  content: z.string(),
                  isFollowup: z
                    .boolean()
                    .default(stryMutAct_9fa48('179') ? true : (stryCov_9fa48('179'), false)),
                })
          )
        ),
        reportGenerated: z
          .boolean()
          .default(stryMutAct_9fa48('180') ? true : (stryCov_9fa48('180'), false)),
        // 多轮对话状态管理字段
        version: z.number().default(1),
        // 当前数据库版本号 (required for optimistic locking)
        originalVersion: z.number().default(1),
        // 加载时版本号 (用于乐观锁检查)
        pendingMessages: z
          .array(
            z.object(
              stryMutAct_9fa48('181')
                ? {}
                : (stryCov_9fa48('181'),
                  {
                    role: z.enum(
                      stryMutAct_9fa48('182')
                        ? []
                        : (stryCov_9fa48('182'),
                          [
                            stryMutAct_9fa48('183') ? '' : (stryCov_9fa48('183'), 'user'),
                            stryMutAct_9fa48('184') ? '' : (stryCov_9fa48('184'), 'assistant'),
                            stryMutAct_9fa48('185') ? '' : (stryCov_9fa48('185'), 'system'),
                          ])
                    ),
                    content: z.string(),
                    isVoice: z
                      .boolean()
                      .default(stryMutAct_9fa48('186') ? true : (stryCov_9fa48('186'), false)),
                  })
            )
          )
          .default(stryMutAct_9fa48('187') ? ['Stryker was here'] : (stryCov_9fa48('187'), [])),
        // 待保存消息列表
        pendingResponses: z
          .array(
            z.object(
              stryMutAct_9fa48('188')
                ? {}
                : (stryCov_9fa48('188'),
                  {
                    questionId: z.string(),
                    content: z.string(),
                    isFollowup: z
                      .boolean()
                      .default(stryMutAct_9fa48('189') ? true : (stryCov_9fa48('189'), false)),
                  })
            )
          )
          .default(stryMutAct_9fa48('190') ? ['Stryker was here'] : (stryCov_9fa48('190'), [])), // 待保存回复列表
      })
);
export type InterviewState = z.infer<typeof InterviewStateSchema>;
export interface NodeInput {
  userId: string;
  content: string;
  isVoice: boolean;
}
export interface NodeOutput {
  response?: string;
  shouldContinue?: boolean;
  nextQuestion?: string;
}
