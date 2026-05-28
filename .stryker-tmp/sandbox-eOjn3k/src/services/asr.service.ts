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
import { error, info } from '../utils/logger.js';
const ASR_API_URL = stryMutAct_9fa48('0')
  ? ''
  : (stryCov_9fa48('0'), 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription');
interface ASRResult {
  text: string;
  success: boolean;
  error?: string;
}
export async function transcribeAudio(audioUrl: string): Promise<ASRResult> {
  if (stryMutAct_9fa48('1')) {
    {
    }
  } else {
    stryCov_9fa48('1');
    const apiKey = process.env.FUN_ASR_API_KEY;
    if (
      stryMutAct_9fa48('4')
        ? !apiKey && apiKey === 'your-fun-asr-api-key'
        : stryMutAct_9fa48('3')
          ? false
          : stryMutAct_9fa48('2')
            ? true
            : (stryCov_9fa48('2', '3', '4'),
              (stryMutAct_9fa48('5') ? apiKey : (stryCov_9fa48('5'), !apiKey)) ||
                (stryMutAct_9fa48('7')
                  ? apiKey !== 'your-fun-asr-api-key'
                  : stryMutAct_9fa48('6')
                    ? false
                    : (stryCov_9fa48('6', '7'),
                      apiKey ===
                        (stryMutAct_9fa48('8')
                          ? ''
                          : (stryCov_9fa48('8'), 'your-fun-asr-api-key')))))
    ) {
      if (stryMutAct_9fa48('9')) {
        {
        }
      } else {
        stryCov_9fa48('9');
        return stryMutAct_9fa48('10')
          ? {}
          : (stryCov_9fa48('10'),
            {
              text: stryMutAct_9fa48('11') ? 'Stryker was here!' : (stryCov_9fa48('11'), ''),
              success: stryMutAct_9fa48('12') ? true : (stryCov_9fa48('12'), false),
              error: stryMutAct_9fa48('13') ? '' : (stryCov_9fa48('13'), 'API key not configured'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('14')) {
        {
        }
      } else {
        stryCov_9fa48('14');
        const response = await fetch(
          ASR_API_URL,
          stryMutAct_9fa48('15')
            ? {}
            : (stryCov_9fa48('15'),
              {
                method: stryMutAct_9fa48('16') ? '' : (stryCov_9fa48('16'), 'POST'),
                headers: stryMutAct_9fa48('17')
                  ? {}
                  : (stryCov_9fa48('17'),
                    {
                      Authorization: stryMutAct_9fa48('18')
                        ? ``
                        : (stryCov_9fa48('18'), `Bearer ${apiKey}`),
                      'Content-Type': stryMutAct_9fa48('19')
                        ? ''
                        : (stryCov_9fa48('19'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('20')
                    ? {}
                    : (stryCov_9fa48('20'),
                      {
                        model: stryMutAct_9fa48('21') ? '' : (stryCov_9fa48('21'), 'paraformer-v2'),
                        file_urls: stryMutAct_9fa48('22') ? [] : (stryCov_9fa48('22'), [audioUrl]),
                      })
                ),
                signal: AbortSignal.timeout(30000),
              })
        );
        if (
          stryMutAct_9fa48('25')
            ? false
            : stryMutAct_9fa48('24')
              ? true
              : stryMutAct_9fa48('23')
                ? response.ok
                : (stryCov_9fa48('23', '24', '25'), !response.ok)
        ) {
          if (stryMutAct_9fa48('26')) {
            {
            }
          } else {
            stryCov_9fa48('26');
            const errMsg = stryMutAct_9fa48('27')
              ? ``
              : (stryCov_9fa48('27'), `ASR API error: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('28')
              ? {}
              : (stryCov_9fa48('28'),
                {
                  text: stryMutAct_9fa48('29') ? 'Stryker was here!' : (stryCov_9fa48('29'), ''),
                  success: stryMutAct_9fa48('30') ? true : (stryCov_9fa48('30'), false),
                  error: errMsg,
                });
          }
        }
        const data = (await response.json()) as {
          data?: {
            results?: Array<{
              transcription?: {
                text?: string;
              };
            }>;
          };
        };
        const text = stryMutAct_9fa48('33')
          ? data?.data?.results?.[0]?.transcription?.text && ''
          : stryMutAct_9fa48('32')
            ? false
            : stryMutAct_9fa48('31')
              ? true
              : (stryCov_9fa48('31', '32', '33'),
                (stryMutAct_9fa48('38')
                  ? data.data?.results?.[0]?.transcription?.text
                  : stryMutAct_9fa48('37')
                    ? data?.data.results?.[0]?.transcription?.text
                    : stryMutAct_9fa48('36')
                      ? data?.data?.results[0]?.transcription?.text
                      : stryMutAct_9fa48('35')
                        ? data?.data?.results?.[0].transcription?.text
                        : stryMutAct_9fa48('34')
                          ? data?.data?.results?.[0]?.transcription.text
                          : (stryCov_9fa48('34', '35', '36', '37', '38'),
                            data?.data?.results?.[0]?.transcription?.text)) ||
                  (stryMutAct_9fa48('39') ? 'Stryker was here!' : (stryCov_9fa48('39'), '')));
        info(
          stryMutAct_9fa48('40') ? '' : (stryCov_9fa48('40'), 'ASR transcription completed'),
          stryMutAct_9fa48('41')
            ? {}
            : (stryCov_9fa48('41'),
              {
                textLength: text.length,
              })
        );
        return stryMutAct_9fa48('42')
          ? {}
          : (stryCov_9fa48('42'),
            {
              text,
              success: stryMutAct_9fa48('43') ? false : (stryCov_9fa48('43'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('44')) {
        {
        }
      } else {
        stryCov_9fa48('44');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('45')
              ? ''
              : (stryCov_9fa48('45'), 'Unknown ASR error');
        error(
          stryMutAct_9fa48('46') ? '' : (stryCov_9fa48('46'), 'ASR transcription failed'),
          stryMutAct_9fa48('47')
            ? {}
            : (stryCov_9fa48('47'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('48')
          ? {}
          : (stryCov_9fa48('48'),
            {
              text: stryMutAct_9fa48('49') ? 'Stryker was here!' : (stryCov_9fa48('49'), ''),
              success: stryMutAct_9fa48('50') ? true : (stryCov_9fa48('50'), false),
              error: errMsg,
            });
      }
    }
  }
}
export function isASRConfigured(): boolean {
  if (stryMutAct_9fa48('51')) {
    {
    }
  } else {
    stryCov_9fa48('51');
    const apiKey = process.env.FUN_ASR_API_KEY;
    return stryMutAct_9fa48('54')
      ? !!apiKey || apiKey !== 'your-fun-asr-api-key'
      : stryMutAct_9fa48('53')
        ? false
        : stryMutAct_9fa48('52')
          ? true
          : (stryCov_9fa48('52', '53', '54'),
            (stryMutAct_9fa48('55')
              ? !apiKey
              : (stryCov_9fa48('55'),
                !(stryMutAct_9fa48('56') ? apiKey : (stryCov_9fa48('56'), !apiKey)))) &&
              (stryMutAct_9fa48('58')
                ? apiKey === 'your-fun-asr-api-key'
                : stryMutAct_9fa48('57')
                  ? true
                  : (stryCov_9fa48('57', '58'),
                    apiKey !==
                      (stryMutAct_9fa48('59')
                        ? ''
                        : (stryCov_9fa48('59'), 'your-fun-asr-api-key')))));
  }
}
