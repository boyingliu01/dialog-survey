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
  if (stryMutAct_9fa48('123')) {
    {
    }
  } else {
    stryCov_9fa48('123');
    if (
      stryMutAct_9fa48('126')
        ? false
        : stryMutAct_9fa48('125')
          ? true
          : stryMutAct_9fa48('124')
            ? quotes.length
            : (stryCov_9fa48('124', '125', '126'), !quotes.length)
    )
      return stryMutAct_9fa48('127') ? ['Stryker was here'] : (stryCov_9fa48('127'), []);
    const prompt = stryMutAct_9fa48('128')
      ? ``
      : (stryCov_9fa48('128'),
        `You are a qualitative research analyst.
Cluster the following ${quotes.length} user quotes about "${dimension}" into 3-8 sub-themes.

**Quotes**:
${quotes.map(stryMutAct_9fa48('129') ? () => undefined : (stryCov_9fa48('129'), (q, i) => (stryMutAct_9fa48('130') ? `` : (stryCov_9fa48('130'), `${stryMutAct_9fa48('131') ? i - 1 : (stryCov_9fa48('131'), i + 1)}. "${q}"`)))).join(stryMutAct_9fa48('132') ? '' : (stryCov_9fa48('132'), '\n'))}

**Task**:
1. Group similar quotes into 3-8 sub-themes
2. For each sub-theme: provide a name, count, overall sentiment (positive/negative/neutral), and 1-2 representative quotes

**Return JSON only**:
[{"subTopicName":"...","mentionCount":3,"overallSentiment":"positive|negative|neutral","representativeQuotes":["..."]}]`);
    try {
      if (stryMutAct_9fa48('133')) {
        {
        }
      } else {
        stryCov_9fa48('133');
        const response = await llm.chat(
          stryMutAct_9fa48('134')
            ? {}
            : (stryCov_9fa48('134'),
              {
                model: stryMutAct_9fa48('137')
                  ? process.env.VOLCENGINE_MODEL && 'deepseek-v3.2'
                  : stryMutAct_9fa48('136')
                    ? false
                    : stryMutAct_9fa48('135')
                      ? true
                      : (stryCov_9fa48('135', '136', '137'),
                        process.env.VOLCENGINE_MODEL ||
                          (stryMutAct_9fa48('138') ? '' : (stryCov_9fa48('138'), 'deepseek-v3.2'))),
                messages: stryMutAct_9fa48('139')
                  ? []
                  : (stryCov_9fa48('139'),
                    [
                      stryMutAct_9fa48('140')
                        ? {}
                        : (stryCov_9fa48('140'),
                          {
                            role: stryMutAct_9fa48('141') ? '' : (stryCov_9fa48('141'), 'user'),
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
      if (stryMutAct_9fa48('142')) {
        {
        }
      } else {
        stryCov_9fa48('142');
        return stryMutAct_9fa48('143') ? ['Stryker was here'] : (stryCov_9fa48('143'), []);
      }
    }
  }
}
export async function discoverEmergentIssues(
  allEmergents: string[],
  llm: LLMService
): Promise<EmergentIssue[]> {
  if (stryMutAct_9fa48('144')) {
    {
    }
  } else {
    stryCov_9fa48('144');
    if (
      stryMutAct_9fa48('147')
        ? false
        : stryMutAct_9fa48('146')
          ? true
          : stryMutAct_9fa48('145')
            ? allEmergents.length
            : (stryCov_9fa48('145', '146', '147'), !allEmergents.length)
    )
      return stryMutAct_9fa48('148') ? ['Stryker was here'] : (stryCov_9fa48('148'), []);
    const prompt = stryMutAct_9fa48('149')
      ? ``
      : (stryCov_9fa48('149'),
        `You are a qualitative research analyst.
From the following user-emergent issue tags across multiple interviews, identify the top 5 most important issues.

**All emergent tags**:
${allEmergents.join(stryMutAct_9fa48('150') ? '' : (stryCov_9fa48('150'), '\n'))}

**Task**:
1. Identify up to 5 most important issues
2. For each: provide name, estimated mention count, urgency (high/medium/low), and up to 3 representative examples

**Return JSON only**:
[{"name":"...","mentionCount":15,"urgency":"high|medium|low","representativeQuotes":["..."]}]`);
    try {
      if (stryMutAct_9fa48('151')) {
        {
        }
      } else {
        stryCov_9fa48('151');
        const response = await llm.chat(
          stryMutAct_9fa48('152')
            ? {}
            : (stryCov_9fa48('152'),
              {
                model: stryMutAct_9fa48('155')
                  ? process.env.VOLCENGINE_MODEL && 'deepseek-v3.2'
                  : stryMutAct_9fa48('154')
                    ? false
                    : stryMutAct_9fa48('153')
                      ? true
                      : (stryCov_9fa48('153', '154', '155'),
                        process.env.VOLCENGINE_MODEL ||
                          (stryMutAct_9fa48('156') ? '' : (stryCov_9fa48('156'), 'deepseek-v3.2'))),
                messages: stryMutAct_9fa48('157')
                  ? []
                  : (stryCov_9fa48('157'),
                    [
                      stryMutAct_9fa48('158')
                        ? {}
                        : (stryCov_9fa48('158'),
                          {
                            role: stryMutAct_9fa48('159') ? '' : (stryCov_9fa48('159'), 'user'),
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
      if (stryMutAct_9fa48('160')) {
        {
        }
      } else {
        stryCov_9fa48('160');
        return stryMutAct_9fa48('161') ? ['Stryker was here'] : (stryCov_9fa48('161'), []);
      }
    }
  }
}
function parseSubThemes(content: string): SubTheme[] {
  if (stryMutAct_9fa48('162')) {
    {
    }
  } else {
    stryCov_9fa48('162');
    try {
      if (stryMutAct_9fa48('163')) {
        {
        }
      } else {
        stryCov_9fa48('163');
        const cleaned = stryMutAct_9fa48('164')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('164'),
            content
              .replace(
                stryMutAct_9fa48('165') ? /```json\n/g : (stryCov_9fa48('165'), /```json\n?/g),
                stryMutAct_9fa48('166') ? 'Stryker was here!' : (stryCov_9fa48('166'), '')
              )
              .replace(
                stryMutAct_9fa48('167') ? /```\n/g : (stryCov_9fa48('167'), /```\n?/g),
                stryMutAct_9fa48('168') ? 'Stryker was here!' : (stryCov_9fa48('168'), '')
              )
              .trim());
        const parsed = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('171')
            ? (Array.isArray(parsed) && parsed.length >= 3) || parsed.length <= 8
            : stryMutAct_9fa48('170')
              ? false
              : stryMutAct_9fa48('169')
                ? true
                : (stryCov_9fa48('169', '170', '171'),
                  (stryMutAct_9fa48('173')
                    ? Array.isArray(parsed) || parsed.length >= 3
                    : stryMutAct_9fa48('172')
                      ? true
                      : (stryCov_9fa48('172', '173'),
                        Array.isArray(parsed) &&
                          (stryMutAct_9fa48('176')
                            ? parsed.length < 3
                            : stryMutAct_9fa48('175')
                              ? parsed.length > 3
                              : stryMutAct_9fa48('174')
                                ? true
                                : (stryCov_9fa48('174', '175', '176'), parsed.length >= 3)))) &&
                    (stryMutAct_9fa48('179')
                      ? parsed.length > 8
                      : stryMutAct_9fa48('178')
                        ? parsed.length < 8
                        : stryMutAct_9fa48('177')
                          ? true
                          : (stryCov_9fa48('177', '178', '179'), parsed.length <= 8)))
        ) {
          if (stryMutAct_9fa48('180')) {
            {
            }
          } else {
            stryCov_9fa48('180');
            return parsed as SubTheme[];
          }
        }
        return stryMutAct_9fa48('181') ? ['Stryker was here'] : (stryCov_9fa48('181'), []);
      }
    } catch {
      if (stryMutAct_9fa48('182')) {
        {
        }
      } else {
        stryCov_9fa48('182');
        return stryMutAct_9fa48('183') ? ['Stryker was here'] : (stryCov_9fa48('183'), []);
      }
    }
  }
}
function parseEmergentIssues(content: string): EmergentIssue[] {
  if (stryMutAct_9fa48('184')) {
    {
    }
  } else {
    stryCov_9fa48('184');
    try {
      if (stryMutAct_9fa48('185')) {
        {
        }
      } else {
        stryCov_9fa48('185');
        const cleaned = stryMutAct_9fa48('186')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('186'),
            content
              .replace(
                stryMutAct_9fa48('187') ? /```json\n/g : (stryCov_9fa48('187'), /```json\n?/g),
                stryMutAct_9fa48('188') ? 'Stryker was here!' : (stryCov_9fa48('188'), '')
              )
              .replace(
                stryMutAct_9fa48('189') ? /```\n/g : (stryCov_9fa48('189'), /```\n?/g),
                stryMutAct_9fa48('190') ? 'Stryker was here!' : (stryCov_9fa48('190'), '')
              )
              .trim());
        const parsed = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('192')
            ? false
            : stryMutAct_9fa48('191')
              ? true
              : (stryCov_9fa48('191', '192'), Array.isArray(parsed))
        ) {
          if (stryMutAct_9fa48('193')) {
            {
            }
          } else {
            stryCov_9fa48('193');
            return parsed.slice(0, 5) as EmergentIssue[];
          }
        }
        return stryMutAct_9fa48('194') ? ['Stryker was here'] : (stryCov_9fa48('194'), []);
      }
    } catch {
      if (stryMutAct_9fa48('195')) {
        {
        }
      } else {
        stryCov_9fa48('195');
        return stryMutAct_9fa48('196') ? ['Stryker was here'] : (stryCov_9fa48('196'), []);
      }
    }
  }
}
