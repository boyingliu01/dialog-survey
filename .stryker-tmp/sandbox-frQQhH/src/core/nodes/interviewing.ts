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
  if (stryMutAct_9fa48('29')) {
    {
    }
  } else {
    stryCov_9fa48('29');
    const content = await loadTemplateContent(state.templateId);
    const currentQ = state.currentQuestion;
    const currentQuestion = content.questions[currentQ];
    const isLastQuestion = stryMutAct_9fa48('33')
      ? currentQ < content.questions.length - 1
      : stryMutAct_9fa48('32')
        ? currentQ > content.questions.length - 1
        : stryMutAct_9fa48('31')
          ? false
          : stryMutAct_9fa48('30')
            ? true
            : (stryCov_9fa48('30', '31', '32', '33'),
              currentQ >=
                (stryMutAct_9fa48('34')
                  ? content.questions.length + 1
                  : (stryCov_9fa48('34'), content.questions.length - 1)));
    const newResponses = stryMutAct_9fa48('35')
      ? []
      : (stryCov_9fa48('35'),
        [
          ...state.responses,
          stryMutAct_9fa48('36')
            ? {}
            : (stryCov_9fa48('36'),
              {
                questionId: stryMutAct_9fa48('37') ? `` : (stryCov_9fa48('37'), `q${currentQ}`),
                content: input.content,
                isFollowup: stryMutAct_9fa48('38') ? true : (stryCov_9fa48('38'), false),
              }),
        ]);
    try {
      if (stryMutAct_9fa48('39')) {
        {
        }
      } else {
        stryCov_9fa48('39');
        const smartResult = await generateSmartResponse(
          state,
          input.content,
          currentQuestion,
          content.llmPromptTemplate,
          isLastQuestion
        );
        info(
          stryMutAct_9fa48('40') ? '' : (stryCov_9fa48('40'), 'Smart response generated'),
          stryMutAct_9fa48('41')
            ? {}
            : (stryCov_9fa48('41'),
              {
                currentQ,
                action: smartResult.action,
                response: stryMutAct_9fa48('42')
                  ? smartResult.response
                  : (stryCov_9fa48('42'), smartResult.response.substring(0, 50)),
              })
        );
        if (
          stryMutAct_9fa48('44')
            ? false
            : stryMutAct_9fa48('43')
              ? true
              : (stryCov_9fa48('43', '44'), smartResult.shouldEndInterview)
        ) {
          if (stryMutAct_9fa48('45')) {
            {
            }
          } else {
            stryCov_9fa48('45');
            return stryMutAct_9fa48('46')
              ? {}
              : (stryCov_9fa48('46'),
                {
                  responses: newResponses,
                  status: stryMutAct_9fa48('47') ? '' : (stryCov_9fa48('47'), 'COMPLETED'),
                  shouldContinue: stryMutAct_9fa48('48') ? true : (stryCov_9fa48('48'), false),
                  response: smartResult.response,
                });
          }
        }
        if (
          stryMutAct_9fa48('51')
            ? smartResult.action !== 'FOLLOWUP'
            : stryMutAct_9fa48('50')
              ? false
              : stryMutAct_9fa48('49')
                ? true
                : (stryCov_9fa48('49', '50', '51'),
                  smartResult.action ===
                    (stryMutAct_9fa48('52') ? '' : (stryCov_9fa48('52'), 'FOLLOWUP')))
        ) {
          if (stryMutAct_9fa48('53')) {
            {
            }
          } else {
            stryCov_9fa48('53');
            return stryMutAct_9fa48('54')
              ? {}
              : (stryCov_9fa48('54'),
                {
                  responses: newResponses,
                  followupCount: stryMutAct_9fa48('55')
                    ? state.followupCount - 1
                    : (stryCov_9fa48('55'), state.followupCount + 1),
                  shouldContinue: stryMutAct_9fa48('56') ? false : (stryCov_9fa48('56'), true),
                  response: smartResult.response,
                });
          }
        }
        if (
          stryMutAct_9fa48('59')
            ? smartResult.action !== 'STAY'
            : stryMutAct_9fa48('58')
              ? false
              : stryMutAct_9fa48('57')
                ? true
                : (stryCov_9fa48('57', '58', '59'),
                  smartResult.action ===
                    (stryMutAct_9fa48('60') ? '' : (stryCov_9fa48('60'), 'STAY')))
        ) {
          if (stryMutAct_9fa48('61')) {
            {
            }
          } else {
            stryCov_9fa48('61');
            return stryMutAct_9fa48('62')
              ? {}
              : (stryCov_9fa48('62'),
                {
                  responses: newResponses,
                  shouldContinue: stryMutAct_9fa48('63') ? false : (stryCov_9fa48('63'), true),
                  response: smartResult.response,
                });
          }
        }
        const nextQuestion =
          content.questions[
            stryMutAct_9fa48('64') ? currentQ - 1 : (stryCov_9fa48('64'), currentQ + 1)
          ];

        // Guard: ensure one question at a time
        if (
          stryMutAct_9fa48('66')
            ? false
            : stryMutAct_9fa48('65')
              ? true
              : (stryCov_9fa48('65', '66'), containsMultipleQuestions(smartResult.response))
        ) {
          if (stryMutAct_9fa48('67')) {
            {
            }
          } else {
            stryCov_9fa48('67');
            warn(
              stryMutAct_9fa48('68')
                ? ''
                : (stryCov_9fa48('68'),
                  'LLM response contains multiple questions. Removing extra text.'),
              stryMutAct_9fa48('69')
                ? {}
                : (stryCov_9fa48('69'),
                  {
                    text: stryMutAct_9fa48('70')
                      ? smartResult.response
                      : (stryCov_9fa48('70'), smartResult.response.substring(0, 80)),
                  })
            );
            // Split on the first question mark and keep the text before it
            const firstSentence = stryMutAct_9fa48('71')
              ? smartResult.response.split(/[?？]/)[0]
              : (stryCov_9fa48('71'),
                smartResult.response
                  .split(stryMutAct_9fa48('72') ? /[^?？]/ : (stryCov_9fa48('72'), /[?？]/))[0]
                  .trim());
            return stryMutAct_9fa48('73')
              ? {}
              : (stryCov_9fa48('73'),
                {
                  responses: newResponses,
                  currentQuestion: stryMutAct_9fa48('74')
                    ? currentQ - 1
                    : (stryCov_9fa48('74'), currentQ + 1),
                  shouldContinue: stryMutAct_9fa48('75')
                    ? !nextQuestion
                    : (stryCov_9fa48('75'),
                      !(stryMutAct_9fa48('76')
                        ? nextQuestion
                        : (stryCov_9fa48('76'), !nextQuestion))),
                  response: stryMutAct_9fa48('77')
                    ? ``
                    : (stryCov_9fa48('77'),
                      `${firstSentence}\n\n${isLastQuestion ? (stryMutAct_9fa48('80') ? content.closingMessage && '访谈已完成，感谢您的参与！' : stryMutAct_9fa48('79') ? false : stryMutAct_9fa48('78') ? true : (stryCov_9fa48('78', '79', '80'), content.closingMessage || (stryMutAct_9fa48('81') ? '' : (stryCov_9fa48('81'), '访谈已完成，感谢您的参与！')))) : nextQuestion}`),
                });
          }
        }
        if (
          stryMutAct_9fa48('84')
            ? isLastQuestion || smartResult.response
            : stryMutAct_9fa48('83')
              ? false
              : stryMutAct_9fa48('82')
                ? true
                : (stryCov_9fa48('82', '83', '84'), isLastQuestion && smartResult.response)
        ) {
          if (stryMutAct_9fa48('85')) {
            {
            }
          } else {
            stryCov_9fa48('85');
            const closing = stryMutAct_9fa48('88')
              ? content.closingMessage &&
                '非常感谢您的分享！这些信息对我们非常有价值。访谈到此结束，祝您工作顺利！'
              : stryMutAct_9fa48('87')
                ? false
                : stryMutAct_9fa48('86')
                  ? true
                  : (stryCov_9fa48('86', '87', '88'),
                    content.closingMessage ||
                      (stryMutAct_9fa48('89')
                        ? ''
                        : (stryCov_9fa48('89'),
                          '非常感谢您的分享！这些信息对我们非常有价值。访谈到此结束，祝您工作顺利！')));
            return stryMutAct_9fa48('90')
              ? {}
              : (stryCov_9fa48('90'),
                {
                  responses: newResponses,
                  currentQuestion: stryMutAct_9fa48('91')
                    ? currentQ - 1
                    : (stryCov_9fa48('91'), currentQ + 1),
                  shouldContinue: stryMutAct_9fa48('92') ? true : (stryCov_9fa48('92'), false),
                  response: stryMutAct_9fa48('93')
                    ? ``
                    : (stryCov_9fa48('93'), `${smartResult.response}\n\n${closing}`),
                });
          }
        }
        return stryMutAct_9fa48('94')
          ? {}
          : (stryCov_9fa48('94'),
            {
              responses: newResponses,
              currentQuestion: stryMutAct_9fa48('95')
                ? currentQ - 1
                : (stryCov_9fa48('95'), currentQ + 1),
              shouldContinue: stryMutAct_9fa48('96')
                ? !nextQuestion
                : (stryCov_9fa48('96'),
                  !(stryMutAct_9fa48('97') ? nextQuestion : (stryCov_9fa48('97'), !nextQuestion))),
              response: smartResult.response
                ? stryMutAct_9fa48('98')
                  ? ``
                  : (stryCov_9fa48('98'), `${smartResult.response}\n\n${nextQuestion}`)
                : nextQuestion,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('99')) {
        {
        }
      } else {
        stryCov_9fa48('99');
        info(
          stryMutAct_9fa48('100')
            ? ''
            : (stryCov_9fa48('100'),
              'Smart response generation failed, falling back to next question'),
          stryMutAct_9fa48('101')
            ? {}
            : (stryCov_9fa48('101'),
              {
                error: e instanceof Error ? e.message : String(e),
              })
        );
      }
    }
    const nextQuestion =
      content.questions[
        stryMutAct_9fa48('102') ? currentQ - 1 : (stryCov_9fa48('102'), currentQ + 1)
      ];
    if (
      stryMutAct_9fa48('104')
        ? false
        : stryMutAct_9fa48('103')
          ? true
          : (stryCov_9fa48('103', '104'), isLastQuestion)
    ) {
      if (stryMutAct_9fa48('105')) {
        {
        }
      } else {
        stryCov_9fa48('105');
        const closing = stryMutAct_9fa48('108')
          ? content.closingMessage && '访谈已完成，感谢您的参与！'
          : stryMutAct_9fa48('107')
            ? false
            : stryMutAct_9fa48('106')
              ? true
              : (stryCov_9fa48('106', '107', '108'),
                content.closingMessage ||
                  (stryMutAct_9fa48('109')
                    ? ''
                    : (stryCov_9fa48('109'), '访谈已完成，感谢您的参与！')));
        return stryMutAct_9fa48('110')
          ? {}
          : (stryCov_9fa48('110'),
            {
              responses: newResponses,
              currentQuestion: stryMutAct_9fa48('111')
                ? currentQ - 1
                : (stryCov_9fa48('111'), currentQ + 1),
              shouldContinue: stryMutAct_9fa48('112') ? true : (stryCov_9fa48('112'), false),
              response: closing,
            });
      }
    }
    return stryMutAct_9fa48('113')
      ? {}
      : (stryCov_9fa48('113'),
        {
          responses: newResponses,
          currentQuestion: stryMutAct_9fa48('114')
            ? currentQ - 1
            : (stryCov_9fa48('114'), currentQ + 1),
          shouldContinue: stryMutAct_9fa48('115')
            ? !nextQuestion
            : (stryCov_9fa48('115'),
              !(stryMutAct_9fa48('116') ? nextQuestion : (stryCov_9fa48('116'), !nextQuestion))),
          response: stryMutAct_9fa48('119')
            ? nextQuestion && '访谈已完成，非常感谢您拨冗参与！'
            : stryMutAct_9fa48('118')
              ? false
              : stryMutAct_9fa48('117')
                ? true
                : (stryCov_9fa48('117', '118', '119'),
                  nextQuestion ||
                    (stryMutAct_9fa48('120')
                      ? ''
                      : (stryCov_9fa48('120'), '访谈已完成，非常感谢您拨冗参与！'))),
        });
  }
}

/**
 * Detect multiple questions in a text. If > 1 question mark, returns true.
 */
function containsMultipleQuestions(text: string): boolean {
  if (stryMutAct_9fa48('121')) {
    {
    }
  } else {
    stryCov_9fa48('121');
    const matches = text.match(
      stryMutAct_9fa48('122') ? /[^?？]/g : (stryCov_9fa48('122'), /[?？]/g)
    );
    return matches
      ? stryMutAct_9fa48('126')
        ? matches.length <= 1
        : stryMutAct_9fa48('125')
          ? matches.length >= 1
          : stryMutAct_9fa48('124')
            ? false
            : stryMutAct_9fa48('123')
              ? true
              : (stryCov_9fa48('123', '124', '125', '126'), matches.length > 1)
      : stryMutAct_9fa48('127')
        ? true
        : (stryCov_9fa48('127'), false);
  }
}
async function loadTemplateContent(templateId?: string): Promise<TemplateContent> {
  if (stryMutAct_9fa48('128')) {
    {
    }
  } else {
    stryCov_9fa48('128');
    const repo = new TemplateRepository();
    if (
      stryMutAct_9fa48('130')
        ? false
        : stryMutAct_9fa48('129')
          ? true
          : (stryCov_9fa48('129', '130'), templateId)
    ) {
      if (stryMutAct_9fa48('131')) {
        {
        }
      } else {
        stryCov_9fa48('131');
        const template = await repo.findById(templateId);
        if (
          stryMutAct_9fa48('133')
            ? false
            : stryMutAct_9fa48('132')
              ? true
              : (stryCov_9fa48('132', '133'), template)
        )
          return JSON.parse(template.content) as TemplateContent;
      }
    }
    return stryMutAct_9fa48('134')
      ? {}
      : (stryCov_9fa48('134'),
        {
          name: stryMutAct_9fa48('135') ? '' : (stryCov_9fa48('135'), 'Default Interview'),
          invitationPrompt: stryMutAct_9fa48('136')
            ? ''
            : (stryCov_9fa48('136'), '您好！欢迎参与本次访谈。'),
          questions: stryMutAct_9fa48('137')
            ? []
            : (stryCov_9fa48('137'),
              [
                stryMutAct_9fa48('138')
                  ? ''
                  : (stryCov_9fa48('138'), '请简单介绍一下您的工作经历？'),
                stryMutAct_9fa48('139')
                  ? ''
                  : (stryCov_9fa48('139'), '您在工作中遇到过最大的挑战是什么？'),
                stryMutAct_9fa48('140') ? '' : (stryCov_9fa48('140'), '您是如何解决这个挑战的？'),
                stryMutAct_9fa48('141') ? '' : (stryCov_9fa48('141'), '您对未来的职业规划是什么？'),
              ]),
        });
  }
}
