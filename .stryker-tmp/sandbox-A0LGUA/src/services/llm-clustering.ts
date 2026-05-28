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
  if (stryMutAct_9fa48('3238')) {
    {
    }
  } else {
    stryCov_9fa48('3238');
    if (
      stryMutAct_9fa48('3241')
        ? false
        : stryMutAct_9fa48('3240')
          ? true
          : stryMutAct_9fa48('3239')
            ? quotes.length
            : (stryCov_9fa48('3239', '3240', '3241'), !quotes.length)
    )
      return stryMutAct_9fa48('3242') ? ['Stryker was here'] : (stryCov_9fa48('3242'), []);
    const prompt = stryMutAct_9fa48('3243')
      ? ``
      : (stryCov_9fa48('3243'),
        `You are a qualitative research analyst.
Cluster the following ${quotes.length} user quotes about "${dimension}" into 3-8 sub-themes.

**Quotes**:
${quotes.map(stryMutAct_9fa48('3244') ? () => undefined : (stryCov_9fa48('3244'), (q, i) => (stryMutAct_9fa48('3245') ? `` : (stryCov_9fa48('3245'), `${stryMutAct_9fa48('3246') ? i - 1 : (stryCov_9fa48('3246'), i + 1)}. "${q}"`)))).join(stryMutAct_9fa48('3247') ? '' : (stryCov_9fa48('3247'), '\n'))}

**Task**:
1. Group similar quotes into 3-8 sub-themes
2. For each sub-theme: provide a name, count, overall sentiment (positive/negative/neutral), and 1-2 representative quotes

**Return JSON only**:
[{"subTopicName":"...","mentionCount":3,"overallSentiment":"positive|negative|neutral","representativeQuotes":["..."]}]`);
    try {
      if (stryMutAct_9fa48('3248')) {
        {
        }
      } else {
        stryCov_9fa48('3248');
        const response = await llm.chat(
          stryMutAct_9fa48('3249')
            ? {}
            : (stryCov_9fa48('3249'),
              {
                model: stryMutAct_9fa48('3252')
                  ? process.env.VOLCENGINE_MODEL && 'deepseek-v3.2'
                  : stryMutAct_9fa48('3251')
                    ? false
                    : stryMutAct_9fa48('3250')
                      ? true
                      : (stryCov_9fa48('3250', '3251', '3252'),
                        process.env.VOLCENGINE_MODEL ||
                          (stryMutAct_9fa48('3253')
                            ? ''
                            : (stryCov_9fa48('3253'), 'deepseek-v3.2'))),
                messages: stryMutAct_9fa48('3254')
                  ? []
                  : (stryCov_9fa48('3254'),
                    [
                      stryMutAct_9fa48('3255')
                        ? {}
                        : (stryCov_9fa48('3255'),
                          {
                            role: stryMutAct_9fa48('3256') ? '' : (stryCov_9fa48('3256'), 'user'),
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
      if (stryMutAct_9fa48('3257')) {
        {
        }
      } else {
        stryCov_9fa48('3257');
        return stryMutAct_9fa48('3258') ? ['Stryker was here'] : (stryCov_9fa48('3258'), []);
      }
    }
  }
}
export async function discoverEmergentIssues(
  allEmergents: string[],
  llm: LLMService
): Promise<EmergentIssue[]> {
  if (stryMutAct_9fa48('3259')) {
    {
    }
  } else {
    stryCov_9fa48('3259');
    if (
      stryMutAct_9fa48('3262')
        ? false
        : stryMutAct_9fa48('3261')
          ? true
          : stryMutAct_9fa48('3260')
            ? allEmergents.length
            : (stryCov_9fa48('3260', '3261', '3262'), !allEmergents.length)
    )
      return stryMutAct_9fa48('3263') ? ['Stryker was here'] : (stryCov_9fa48('3263'), []);
    const prompt = stryMutAct_9fa48('3264')
      ? ``
      : (stryCov_9fa48('3264'),
        `You are a qualitative research analyst.
From the following user-emergent issue tags across multiple interviews, identify the top 5 most important issues.

**All emergent tags**:
${allEmergents.join(stryMutAct_9fa48('3265') ? '' : (stryCov_9fa48('3265'), '\n'))}

**Task**:
1. Identify up to 5 most important issues
2. For each: provide name, estimated mention count, urgency (high/medium/low), and up to 3 representative examples

**Return JSON only**:
[{"name":"...","mentionCount":15,"urgency":"high|medium|low","representativeQuotes":["..."]}]`);
    try {
      if (stryMutAct_9fa48('3266')) {
        {
        }
      } else {
        stryCov_9fa48('3266');
        const response = await llm.chat(
          stryMutAct_9fa48('3267')
            ? {}
            : (stryCov_9fa48('3267'),
              {
                model: stryMutAct_9fa48('3270')
                  ? process.env.VOLCENGINE_MODEL && 'deepseek-v3.2'
                  : stryMutAct_9fa48('3269')
                    ? false
                    : stryMutAct_9fa48('3268')
                      ? true
                      : (stryCov_9fa48('3268', '3269', '3270'),
                        process.env.VOLCENGINE_MODEL ||
                          (stryMutAct_9fa48('3271')
                            ? ''
                            : (stryCov_9fa48('3271'), 'deepseek-v3.2'))),
                messages: stryMutAct_9fa48('3272')
                  ? []
                  : (stryCov_9fa48('3272'),
                    [
                      stryMutAct_9fa48('3273')
                        ? {}
                        : (stryCov_9fa48('3273'),
                          {
                            role: stryMutAct_9fa48('3274') ? '' : (stryCov_9fa48('3274'), 'user'),
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
      if (stryMutAct_9fa48('3275')) {
        {
        }
      } else {
        stryCov_9fa48('3275');
        return stryMutAct_9fa48('3276') ? ['Stryker was here'] : (stryCov_9fa48('3276'), []);
      }
    }
  }
}
function parseSubThemes(content: string): SubTheme[] {
  if (stryMutAct_9fa48('3277')) {
    {
    }
  } else {
    stryCov_9fa48('3277');
    try {
      if (stryMutAct_9fa48('3278')) {
        {
        }
      } else {
        stryCov_9fa48('3278');
        const cleaned = stryMutAct_9fa48('3279')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('3279'),
            content
              .replace(
                stryMutAct_9fa48('3280') ? /```json\n/g : (stryCov_9fa48('3280'), /```json\n?/g),
                stryMutAct_9fa48('3281') ? 'Stryker was here!' : (stryCov_9fa48('3281'), '')
              )
              .replace(
                stryMutAct_9fa48('3282') ? /```\n/g : (stryCov_9fa48('3282'), /```\n?/g),
                stryMutAct_9fa48('3283') ? 'Stryker was here!' : (stryCov_9fa48('3283'), '')
              )
              .trim());
        const parsed = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('3286')
            ? (Array.isArray(parsed) && parsed.length >= 3) || parsed.length <= 8
            : stryMutAct_9fa48('3285')
              ? false
              : stryMutAct_9fa48('3284')
                ? true
                : (stryCov_9fa48('3284', '3285', '3286'),
                  (stryMutAct_9fa48('3288')
                    ? Array.isArray(parsed) || parsed.length >= 3
                    : stryMutAct_9fa48('3287')
                      ? true
                      : (stryCov_9fa48('3287', '3288'),
                        Array.isArray(parsed) &&
                          (stryMutAct_9fa48('3291')
                            ? parsed.length < 3
                            : stryMutAct_9fa48('3290')
                              ? parsed.length > 3
                              : stryMutAct_9fa48('3289')
                                ? true
                                : (stryCov_9fa48('3289', '3290', '3291'), parsed.length >= 3)))) &&
                    (stryMutAct_9fa48('3294')
                      ? parsed.length > 8
                      : stryMutAct_9fa48('3293')
                        ? parsed.length < 8
                        : stryMutAct_9fa48('3292')
                          ? true
                          : (stryCov_9fa48('3292', '3293', '3294'), parsed.length <= 8)))
        ) {
          if (stryMutAct_9fa48('3295')) {
            {
            }
          } else {
            stryCov_9fa48('3295');
            return parsed as SubTheme[];
          }
        }
        return stryMutAct_9fa48('3296') ? ['Stryker was here'] : (stryCov_9fa48('3296'), []);
      }
    } catch {
      if (stryMutAct_9fa48('3297')) {
        {
        }
      } else {
        stryCov_9fa48('3297');
        return stryMutAct_9fa48('3298') ? ['Stryker was here'] : (stryCov_9fa48('3298'), []);
      }
    }
  }
}
function parseEmergentIssues(content: string): EmergentIssue[] {
  if (stryMutAct_9fa48('3299')) {
    {
    }
  } else {
    stryCov_9fa48('3299');
    try {
      if (stryMutAct_9fa48('3300')) {
        {
        }
      } else {
        stryCov_9fa48('3300');
        const cleaned = stryMutAct_9fa48('3301')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('3301'),
            content
              .replace(
                stryMutAct_9fa48('3302') ? /```json\n/g : (stryCov_9fa48('3302'), /```json\n?/g),
                stryMutAct_9fa48('3303') ? 'Stryker was here!' : (stryCov_9fa48('3303'), '')
              )
              .replace(
                stryMutAct_9fa48('3304') ? /```\n/g : (stryCov_9fa48('3304'), /```\n?/g),
                stryMutAct_9fa48('3305') ? 'Stryker was here!' : (stryCov_9fa48('3305'), '')
              )
              .trim());
        const parsed = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('3307')
            ? false
            : stryMutAct_9fa48('3306')
              ? true
              : (stryCov_9fa48('3306', '3307'), Array.isArray(parsed))
        ) {
          if (stryMutAct_9fa48('3308')) {
            {
            }
          } else {
            stryCov_9fa48('3308');
            return parsed.slice(0, 5) as EmergentIssue[];
          }
        }
        return stryMutAct_9fa48('3309') ? ['Stryker was here'] : (stryCov_9fa48('3309'), []);
      }
    } catch {
      if (stryMutAct_9fa48('3310')) {
        {
        }
      } else {
        stryCov_9fa48('3310');
        return stryMutAct_9fa48('3311') ? ['Stryker was here'] : (stryCov_9fa48('3311'), []);
      }
    }
  }
}
