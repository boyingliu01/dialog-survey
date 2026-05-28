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
import { generateSmartResponse } from '../../services/followup.service.js';
import { info, warn } from '../../utils/logger.js';
import type { InterviewState, NodeOutput } from '../types/index.js';
export interface TemplateContent {
  name: string;
  description?: string;
  invitationPrompt: string;
  questions: string[];
  closingMessage?: string;
  llmPromptTemplate?: string;
}
export async function interviewingNode(
  state: InterviewState,
  input: {
    content: string;
  }
): Promise<Partial<InterviewState> & NodeOutput> {
  if (stryMutAct_9fa48('1144')) {
    {
    }
  } else {
    stryCov_9fa48('1144');
    const content = await loadTemplateContent(state.templateId);
    const currentQ = state.currentQuestion;
    const currentQuestion = content.questions[currentQ];
    const isLastQuestion = stryMutAct_9fa48('1148')
      ? currentQ < content.questions.length - 1
      : stryMutAct_9fa48('1147')
        ? currentQ > content.questions.length - 1
        : stryMutAct_9fa48('1146')
          ? false
          : stryMutAct_9fa48('1145')
            ? true
            : (stryCov_9fa48('1145', '1146', '1147', '1148'),
              currentQ >=
                (stryMutAct_9fa48('1149')
                  ? content.questions.length + 1
                  : (stryCov_9fa48('1149'), content.questions.length - 1)));
    const newResponses = stryMutAct_9fa48('1150')
      ? []
      : (stryCov_9fa48('1150'),
        [
          ...state.responses,
          stryMutAct_9fa48('1151')
            ? {}
            : (stryCov_9fa48('1151'),
              {
                questionId: stryMutAct_9fa48('1152') ? `` : (stryCov_9fa48('1152'), `q${currentQ}`),
                content: input.content,
                isFollowup: stryMutAct_9fa48('1153') ? true : (stryCov_9fa48('1153'), false),
              }),
        ]);
    try {
      if (stryMutAct_9fa48('1154')) {
        {
        }
      } else {
        stryCov_9fa48('1154');
        const smartResult = await generateSmartResponse(
          state,
          input.content,
          currentQuestion,
          content.llmPromptTemplate,
          isLastQuestion
        );
        info(
          stryMutAct_9fa48('1155') ? '' : (stryCov_9fa48('1155'), 'Smart response generated'),
          stryMutAct_9fa48('1156')
            ? {}
            : (stryCov_9fa48('1156'),
              {
                currentQ,
                action: smartResult.action,
                response: stryMutAct_9fa48('1157')
                  ? smartResult.response
                  : (stryCov_9fa48('1157'), smartResult.response.substring(0, 50)),
              })
        );
        if (
          stryMutAct_9fa48('1159')
            ? false
            : stryMutAct_9fa48('1158')
              ? true
              : (stryCov_9fa48('1158', '1159'), smartResult.shouldEndInterview)
        ) {
          if (stryMutAct_9fa48('1160')) {
            {
            }
          } else {
            stryCov_9fa48('1160');
            return stryMutAct_9fa48('1161')
              ? {}
              : (stryCov_9fa48('1161'),
                {
                  responses: newResponses,
                  status: stryMutAct_9fa48('1162') ? '' : (stryCov_9fa48('1162'), 'COMPLETED'),
                  shouldContinue: stryMutAct_9fa48('1163') ? true : (stryCov_9fa48('1163'), false),
                  response: smartResult.response,
                });
          }
        }
        if (
          stryMutAct_9fa48('1166')
            ? smartResult.action !== 'FOLLOWUP'
            : stryMutAct_9fa48('1165')
              ? false
              : stryMutAct_9fa48('1164')
                ? true
                : (stryCov_9fa48('1164', '1165', '1166'),
                  smartResult.action ===
                    (stryMutAct_9fa48('1167') ? '' : (stryCov_9fa48('1167'), 'FOLLOWUP')))
        ) {
          if (stryMutAct_9fa48('1168')) {
            {
            }
          } else {
            stryCov_9fa48('1168');
            return stryMutAct_9fa48('1169')
              ? {}
              : (stryCov_9fa48('1169'),
                {
                  responses: newResponses,
                  followupCount: stryMutAct_9fa48('1170')
                    ? state.followupCount - 1
                    : (stryCov_9fa48('1170'), state.followupCount + 1),
                  shouldContinue: stryMutAct_9fa48('1171') ? false : (stryCov_9fa48('1171'), true),
                  response: smartResult.response,
                });
          }
        }
        if (
          stryMutAct_9fa48('1174')
            ? smartResult.action !== 'STAY'
            : stryMutAct_9fa48('1173')
              ? false
              : stryMutAct_9fa48('1172')
                ? true
                : (stryCov_9fa48('1172', '1173', '1174'),
                  smartResult.action ===
                    (stryMutAct_9fa48('1175') ? '' : (stryCov_9fa48('1175'), 'STAY')))
        ) {
          if (stryMutAct_9fa48('1176')) {
            {
            }
          } else {
            stryCov_9fa48('1176');
            return stryMutAct_9fa48('1177')
              ? {}
              : (stryCov_9fa48('1177'),
                {
                  responses: newResponses,
                  shouldContinue: stryMutAct_9fa48('1178') ? false : (stryCov_9fa48('1178'), true),
                  response: smartResult.response,
                });
          }
        }
        const nextQuestion =
          content.questions[
            stryMutAct_9fa48('1179') ? currentQ - 1 : (stryCov_9fa48('1179'), currentQ + 1)
          ];

        // Guard: ensure one question at a time
        if (
          stryMutAct_9fa48('1181')
            ? false
            : stryMutAct_9fa48('1180')
              ? true
              : (stryCov_9fa48('1180', '1181'), containsMultipleQuestions(smartResult.response))
        ) {
          if (stryMutAct_9fa48('1182')) {
            {
            }
          } else {
            stryCov_9fa48('1182');
            warn(
              stryMutAct_9fa48('1183')
                ? ''
                : (stryCov_9fa48('1183'),
                  'LLM response contains multiple questions. Removing extra text.'),
              stryMutAct_9fa48('1184')
                ? {}
                : (stryCov_9fa48('1184'),
                  {
                    text: stryMutAct_9fa48('1185')
                      ? smartResult.response
                      : (stryCov_9fa48('1185'), smartResult.response.substring(0, 80)),
                  })
            );
            // Split on the first question mark and keep the text before it
            const firstSentence = stryMutAct_9fa48('1186')
              ? smartResult.response.split(/[?？]/)[0]
              : (stryCov_9fa48('1186'),
                smartResult.response
                  .split(stryMutAct_9fa48('1187') ? /[^?？]/ : (stryCov_9fa48('1187'), /[?？]/))[0]
                  .trim());
            return stryMutAct_9fa48('1188')
              ? {}
              : (stryCov_9fa48('1188'),
                {
                  responses: newResponses,
                  currentQuestion: stryMutAct_9fa48('1189')
                    ? currentQ - 1
                    : (stryCov_9fa48('1189'), currentQ + 1),
                  shouldContinue: stryMutAct_9fa48('1190')
                    ? !nextQuestion
                    : (stryCov_9fa48('1190'),
                      !(stryMutAct_9fa48('1191')
                        ? nextQuestion
                        : (stryCov_9fa48('1191'), !nextQuestion))),
                  response: stryMutAct_9fa48('1192')
                    ? ``
                    : (stryCov_9fa48('1192'),
                      `${firstSentence}\n\n${isLastQuestion ? (stryMutAct_9fa48('1195') ? content.closingMessage && '访谈已完成，感谢您的参与！' : stryMutAct_9fa48('1194') ? false : stryMutAct_9fa48('1193') ? true : (stryCov_9fa48('1193', '1194', '1195'), content.closingMessage || (stryMutAct_9fa48('1196') ? '' : (stryCov_9fa48('1196'), '访谈已完成，感谢您的参与！')))) : nextQuestion}`),
                });
          }
        }
        if (
          stryMutAct_9fa48('1199')
            ? isLastQuestion || smartResult.response
            : stryMutAct_9fa48('1198')
              ? false
              : stryMutAct_9fa48('1197')
                ? true
                : (stryCov_9fa48('1197', '1198', '1199'), isLastQuestion && smartResult.response)
        ) {
          if (stryMutAct_9fa48('1200')) {
            {
            }
          } else {
            stryCov_9fa48('1200');
            const closing = stryMutAct_9fa48('1203')
              ? content.closingMessage &&
                '非常感谢您的分享！这些信息对我们非常有价值。访谈到此结束，祝您工作顺利！'
              : stryMutAct_9fa48('1202')
                ? false
                : stryMutAct_9fa48('1201')
                  ? true
                  : (stryCov_9fa48('1201', '1202', '1203'),
                    content.closingMessage ||
                      (stryMutAct_9fa48('1204')
                        ? ''
                        : (stryCov_9fa48('1204'),
                          '非常感谢您的分享！这些信息对我们非常有价值。访谈到此结束，祝您工作顺利！')));
            return stryMutAct_9fa48('1205')
              ? {}
              : (stryCov_9fa48('1205'),
                {
                  responses: newResponses,
                  currentQuestion: stryMutAct_9fa48('1206')
                    ? currentQ - 1
                    : (stryCov_9fa48('1206'), currentQ + 1),
                  shouldContinue: stryMutAct_9fa48('1207') ? true : (stryCov_9fa48('1207'), false),
                  response: stryMutAct_9fa48('1208')
                    ? ``
                    : (stryCov_9fa48('1208'), `${smartResult.response}\n\n${closing}`),
                });
          }
        }
        return stryMutAct_9fa48('1209')
          ? {}
          : (stryCov_9fa48('1209'),
            {
              responses: newResponses,
              currentQuestion: stryMutAct_9fa48('1210')
                ? currentQ - 1
                : (stryCov_9fa48('1210'), currentQ + 1),
              shouldContinue: stryMutAct_9fa48('1211')
                ? !nextQuestion
                : (stryCov_9fa48('1211'),
                  !(stryMutAct_9fa48('1212')
                    ? nextQuestion
                    : (stryCov_9fa48('1212'), !nextQuestion))),
              response: smartResult.response
                ? stryMutAct_9fa48('1213')
                  ? ``
                  : (stryCov_9fa48('1213'), `${smartResult.response}\n\n${nextQuestion}`)
                : nextQuestion,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('1214')) {
        {
        }
      } else {
        stryCov_9fa48('1214');
        info(
          stryMutAct_9fa48('1215')
            ? ''
            : (stryCov_9fa48('1215'),
              'Smart response generation failed, falling back to next question'),
          stryMutAct_9fa48('1216')
            ? {}
            : (stryCov_9fa48('1216'),
              {
                error: e instanceof Error ? e.message : String(e),
              })
        );
      }
    }
    const nextQuestion =
      content.questions[
        stryMutAct_9fa48('1217') ? currentQ - 1 : (stryCov_9fa48('1217'), currentQ + 1)
      ];
    if (
      stryMutAct_9fa48('1219')
        ? false
        : stryMutAct_9fa48('1218')
          ? true
          : (stryCov_9fa48('1218', '1219'), isLastQuestion)
    ) {
      if (stryMutAct_9fa48('1220')) {
        {
        }
      } else {
        stryCov_9fa48('1220');
        const closing = stryMutAct_9fa48('1223')
          ? content.closingMessage && '访谈已完成，感谢您的参与！'
          : stryMutAct_9fa48('1222')
            ? false
            : stryMutAct_9fa48('1221')
              ? true
              : (stryCov_9fa48('1221', '1222', '1223'),
                content.closingMessage ||
                  (stryMutAct_9fa48('1224')
                    ? ''
                    : (stryCov_9fa48('1224'), '访谈已完成，感谢您的参与！')));
        return stryMutAct_9fa48('1225')
          ? {}
          : (stryCov_9fa48('1225'),
            {
              responses: newResponses,
              currentQuestion: stryMutAct_9fa48('1226')
                ? currentQ - 1
                : (stryCov_9fa48('1226'), currentQ + 1),
              shouldContinue: stryMutAct_9fa48('1227') ? true : (stryCov_9fa48('1227'), false),
              response: closing,
            });
      }
    }
    return stryMutAct_9fa48('1228')
      ? {}
      : (stryCov_9fa48('1228'),
        {
          responses: newResponses,
          currentQuestion: stryMutAct_9fa48('1229')
            ? currentQ - 1
            : (stryCov_9fa48('1229'), currentQ + 1),
          shouldContinue: stryMutAct_9fa48('1230')
            ? !nextQuestion
            : (stryCov_9fa48('1230'),
              !(stryMutAct_9fa48('1231') ? nextQuestion : (stryCov_9fa48('1231'), !nextQuestion))),
          response: stryMutAct_9fa48('1234')
            ? nextQuestion && '访谈已完成，非常感谢您拨冗参与！'
            : stryMutAct_9fa48('1233')
              ? false
              : stryMutAct_9fa48('1232')
                ? true
                : (stryCov_9fa48('1232', '1233', '1234'),
                  nextQuestion ||
                    (stryMutAct_9fa48('1235')
                      ? ''
                      : (stryCov_9fa48('1235'), '访谈已完成，非常感谢您拨冗参与！'))),
        });
  }
}

/**
 * Detect multiple questions in a text. If > 1 question mark, returns true.
 */
function containsMultipleQuestions(text: string): boolean {
  if (stryMutAct_9fa48('1236')) {
    {
    }
  } else {
    stryCov_9fa48('1236');
    const matches = text.match(
      stryMutAct_9fa48('1237') ? /[^?？]/g : (stryCov_9fa48('1237'), /[?？]/g)
    );
    return matches
      ? stryMutAct_9fa48('1241')
        ? matches.length <= 1
        : stryMutAct_9fa48('1240')
          ? matches.length >= 1
          : stryMutAct_9fa48('1239')
            ? false
            : stryMutAct_9fa48('1238')
              ? true
              : (stryCov_9fa48('1238', '1239', '1240', '1241'), matches.length > 1)
      : stryMutAct_9fa48('1242')
        ? true
        : (stryCov_9fa48('1242'), false);
  }
}
async function loadTemplateContent(templateId?: string): Promise<TemplateContent> {
  if (stryMutAct_9fa48('1243')) {
    {
    }
  } else {
    stryCov_9fa48('1243');
    const repo = new TemplateRepository();
    if (
      stryMutAct_9fa48('1245')
        ? false
        : stryMutAct_9fa48('1244')
          ? true
          : (stryCov_9fa48('1244', '1245'), templateId)
    ) {
      if (stryMutAct_9fa48('1246')) {
        {
        }
      } else {
        stryCov_9fa48('1246');
        const template = await repo.findById(templateId);
        if (
          stryMutAct_9fa48('1248')
            ? false
            : stryMutAct_9fa48('1247')
              ? true
              : (stryCov_9fa48('1247', '1248'), template)
        )
          return JSON.parse(template.content) as TemplateContent;
      }
    }
    return stryMutAct_9fa48('1249')
      ? {}
      : (stryCov_9fa48('1249'),
        {
          name: stryMutAct_9fa48('1250') ? '' : (stryCov_9fa48('1250'), 'Default Interview'),
          invitationPrompt: stryMutAct_9fa48('1251')
            ? ''
            : (stryCov_9fa48('1251'), '您好！欢迎参与本次访谈。'),
          questions: stryMutAct_9fa48('1252')
            ? []
            : (stryCov_9fa48('1252'),
              [
                stryMutAct_9fa48('1253')
                  ? ''
                  : (stryCov_9fa48('1253'), '请简单介绍一下您的工作经历？'),
                stryMutAct_9fa48('1254')
                  ? ''
                  : (stryCov_9fa48('1254'), '您在工作中遇到过最大的挑战是什么？'),
                stryMutAct_9fa48('1255') ? '' : (stryCov_9fa48('1255'), '您是如何解决这个挑战的？'),
                stryMutAct_9fa48('1256')
                  ? ''
                  : (stryCov_9fa48('1256'), '您对未来的职业规划是什么？'),
              ]),
        });
  }
}
