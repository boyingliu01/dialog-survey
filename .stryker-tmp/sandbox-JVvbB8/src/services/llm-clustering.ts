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
import { type LLMService } from '../integrations/llm/base.js';
export interface SubTheme {
  subTopicName: string;
  mentionCount: number;
  overallSentiment: string;
  representativeQuotes: string[];
}
export interface EmergentIssue {
  name: string;
  mentionCount: number;
  urgency: 'high' | 'medium' | 'low';
  representativeQuotes: string[];
}
export async function clusterDimensionQuotes(
  quotes: string[],
  dimension: string,
  llm: LLMService
): Promise<SubTheme[]> {
  if (stryMutAct_9fa48('364')) {
    {
    }
  } else {
    stryCov_9fa48('364');
    if (
      stryMutAct_9fa48('367')
        ? false
        : stryMutAct_9fa48('366')
          ? true
          : stryMutAct_9fa48('365')
            ? quotes.length
            : (stryCov_9fa48('365', '366', '367'), !quotes.length)
    )
      return stryMutAct_9fa48('368') ? ['Stryker was here'] : (stryCov_9fa48('368'), []);
    const prompt = stryMutAct_9fa48('369')
      ? ``
      : (stryCov_9fa48('369'),
        `You are a qualitative research analyst.
Cluster the following ${quotes.length} user quotes about "${dimension}" into 3-8 sub-themes.

**Quotes**:
${quotes.map(stryMutAct_9fa48('370') ? () => undefined : (stryCov_9fa48('370'), (q, i) => (stryMutAct_9fa48('371') ? `` : (stryCov_9fa48('371'), `${stryMutAct_9fa48('372') ? i - 1 : (stryCov_9fa48('372'), i + 1)}. "${q}"`)))).join(stryMutAct_9fa48('373') ? '' : (stryCov_9fa48('373'), '\n'))}

**Task**:
1. Group similar quotes into 3-8 sub-themes
2. For each sub-theme: provide a name, count, overall sentiment (positive/negative/neutral), and 1-2 representative quotes

**Return JSON only**:
[{"subTopicName":"...","mentionCount":3,"overallSentiment":"positive|negative|neutral","representativeQuotes":["..."]}]`);
    try {
      if (stryMutAct_9fa48('374')) {
        {
        }
      } else {
        stryCov_9fa48('374');
        const response = await llm.chat(
          stryMutAct_9fa48('375')
            ? {}
            : (stryCov_9fa48('375'),
              {
                model: stryMutAct_9fa48('378')
                  ? process.env.VOLCENGINE_MODEL && 'deepseek-v3.2'
                  : stryMutAct_9fa48('377')
                    ? false
                    : stryMutAct_9fa48('376')
                      ? true
                      : (stryCov_9fa48('376', '377', '378'),
                        process.env.VOLCENGINE_MODEL ||
                          (stryMutAct_9fa48('379') ? '' : (stryCov_9fa48('379'), 'deepseek-v3.2'))),
                messages: stryMutAct_9fa48('380')
                  ? []
                  : (stryCov_9fa48('380'),
                    [
                      stryMutAct_9fa48('381')
                        ? {}
                        : (stryCov_9fa48('381'),
                          {
                            role: stryMutAct_9fa48('382') ? '' : (stryCov_9fa48('382'), 'user'),
                            content: prompt,
                          }),
                    ]),
                max_tokens: 2000,
                temperature: 0.1,
              })
        );
        const parsed = parseSubThemes(response.content);
        return parsed;
      }
    } catch {
      if (stryMutAct_9fa48('383')) {
        {
        }
      } else {
        stryCov_9fa48('383');
        return stryMutAct_9fa48('384') ? ['Stryker was here'] : (stryCov_9fa48('384'), []);
      }
    }
  }
}
export async function discoverEmergentIssues(
  allEmergents: string[],
  llm: LLMService
): Promise<EmergentIssue[]> {
  if (stryMutAct_9fa48('385')) {
    {
    }
  } else {
    stryCov_9fa48('385');
    if (
      stryMutAct_9fa48('388')
        ? false
        : stryMutAct_9fa48('387')
          ? true
          : stryMutAct_9fa48('386')
            ? allEmergents.length
            : (stryCov_9fa48('386', '387', '388'), !allEmergents.length)
    )
      return stryMutAct_9fa48('389') ? ['Stryker was here'] : (stryCov_9fa48('389'), []);
    const prompt = stryMutAct_9fa48('390')
      ? ``
      : (stryCov_9fa48('390'),
        `You are a qualitative research analyst.
From the following user-emergent issue tags across multiple interviews, identify the top 5 most important issues.

**All emergent tags**:
${allEmergents.join(stryMutAct_9fa48('391') ? '' : (stryCov_9fa48('391'), '\n'))}

**Task**:
1. Identify up to 5 most important issues
2. For each: provide name, estimated mention count, urgency (high/medium/low), and up to 3 representative examples

**Return JSON only**:
[{"name":"...","mentionCount":15,"urgency":"high|medium|low","representativeQuotes":["..."]}]`);
    try {
      if (stryMutAct_9fa48('392')) {
        {
        }
      } else {
        stryCov_9fa48('392');
        const response = await llm.chat(
          stryMutAct_9fa48('393')
            ? {}
            : (stryCov_9fa48('393'),
              {
                model: stryMutAct_9fa48('396')
                  ? process.env.VOLCENGINE_MODEL && 'deepseek-v3.2'
                  : stryMutAct_9fa48('395')
                    ? false
                    : stryMutAct_9fa48('394')
                      ? true
                      : (stryCov_9fa48('394', '395', '396'),
                        process.env.VOLCENGINE_MODEL ||
                          (stryMutAct_9fa48('397') ? '' : (stryCov_9fa48('397'), 'deepseek-v3.2'))),
                messages: stryMutAct_9fa48('398')
                  ? []
                  : (stryCov_9fa48('398'),
                    [
                      stryMutAct_9fa48('399')
                        ? {}
                        : (stryCov_9fa48('399'),
                          {
                            role: stryMutAct_9fa48('400') ? '' : (stryCov_9fa48('400'), 'user'),
                            content: prompt,
                          }),
                    ]),
                max_tokens: 1500,
                temperature: 0.1,
              })
        );
        const parsed = parseEmergentIssues(response.content);
        return parsed;
      }
    } catch {
      if (stryMutAct_9fa48('401')) {
        {
        }
      } else {
        stryCov_9fa48('401');
        return stryMutAct_9fa48('402') ? ['Stryker was here'] : (stryCov_9fa48('402'), []);
      }
    }
  }
}
function parseSubThemes(content: string): SubTheme[] {
  if (stryMutAct_9fa48('403')) {
    {
    }
  } else {
    stryCov_9fa48('403');
    try {
      if (stryMutAct_9fa48('404')) {
        {
        }
      } else {
        stryCov_9fa48('404');
        const cleaned = stryMutAct_9fa48('405')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('405'),
            content
              .replace(
                stryMutAct_9fa48('406') ? /```json\n/g : (stryCov_9fa48('406'), /```json\n?/g),
                stryMutAct_9fa48('407') ? 'Stryker was here!' : (stryCov_9fa48('407'), '')
              )
              .replace(
                stryMutAct_9fa48('408') ? /```\n/g : (stryCov_9fa48('408'), /```\n?/g),
                stryMutAct_9fa48('409') ? 'Stryker was here!' : (stryCov_9fa48('409'), '')
              )
              .trim());
        const parsed = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('412')
            ? (Array.isArray(parsed) && parsed.length >= 3) || parsed.length <= 8
            : stryMutAct_9fa48('411')
              ? false
              : stryMutAct_9fa48('410')
                ? true
                : (stryCov_9fa48('410', '411', '412'),
                  (stryMutAct_9fa48('414')
                    ? Array.isArray(parsed) || parsed.length >= 3
                    : stryMutAct_9fa48('413')
                      ? true
                      : (stryCov_9fa48('413', '414'),
                        Array.isArray(parsed) &&
                          (stryMutAct_9fa48('417')
                            ? parsed.length < 3
                            : stryMutAct_9fa48('416')
                              ? parsed.length > 3
                              : stryMutAct_9fa48('415')
                                ? true
                                : (stryCov_9fa48('415', '416', '417'), parsed.length >= 3)))) &&
                    (stryMutAct_9fa48('420')
                      ? parsed.length > 8
                      : stryMutAct_9fa48('419')
                        ? parsed.length < 8
                        : stryMutAct_9fa48('418')
                          ? true
                          : (stryCov_9fa48('418', '419', '420'), parsed.length <= 8)))
        ) {
          if (stryMutAct_9fa48('421')) {
            {
            }
          } else {
            stryCov_9fa48('421');
            return parsed as SubTheme[];
          }
        }
        return stryMutAct_9fa48('422') ? ['Stryker was here'] : (stryCov_9fa48('422'), []);
      }
    } catch {
      if (stryMutAct_9fa48('423')) {
        {
        }
      } else {
        stryCov_9fa48('423');
        return stryMutAct_9fa48('424') ? ['Stryker was here'] : (stryCov_9fa48('424'), []);
      }
    }
  }
}
function parseEmergentIssues(content: string): EmergentIssue[] {
  if (stryMutAct_9fa48('425')) {
    {
    }
  } else {
    stryCov_9fa48('425');
    try {
      if (stryMutAct_9fa48('426')) {
        {
        }
      } else {
        stryCov_9fa48('426');
        const cleaned = stryMutAct_9fa48('427')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('427'),
            content
              .replace(
                stryMutAct_9fa48('428') ? /```json\n/g : (stryCov_9fa48('428'), /```json\n?/g),
                stryMutAct_9fa48('429') ? 'Stryker was here!' : (stryCov_9fa48('429'), '')
              )
              .replace(
                stryMutAct_9fa48('430') ? /```\n/g : (stryCov_9fa48('430'), /```\n?/g),
                stryMutAct_9fa48('431') ? 'Stryker was here!' : (stryCov_9fa48('431'), '')
              )
              .trim());
        const parsed = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('433')
            ? false
            : stryMutAct_9fa48('432')
              ? true
              : (stryCov_9fa48('432', '433'), Array.isArray(parsed))
        ) {
          if (stryMutAct_9fa48('434')) {
            {
            }
          } else {
            stryCov_9fa48('434');
            return parsed.slice(0, 5) as EmergentIssue[];
          }
        }
        return stryMutAct_9fa48('435') ? ['Stryker was here'] : (stryCov_9fa48('435'), []);
      }
    } catch {
      if (stryMutAct_9fa48('436')) {
        {
        }
      } else {
        stryCov_9fa48('436');
        return stryMutAct_9fa48('437') ? ['Stryker was here'] : (stryCov_9fa48('437'), []);
      }
    }
  }
}
