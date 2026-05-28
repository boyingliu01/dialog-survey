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
const ASR_API_URL = stryMutAct_9fa48('310')
  ? ''
  : (stryCov_9fa48('310'),
    'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription');
interface ASRResult {
  text: string;
  success: boolean;
  error?: string;
}
export async function transcribeAudio(audioUrl: string): Promise<ASRResult> {
  if (stryMutAct_9fa48('311')) {
    {
    }
  } else {
    stryCov_9fa48('311');
    const apiKey = process.env.FUN_ASR_API_KEY;
    if (
      stryMutAct_9fa48('314')
        ? !apiKey && apiKey === 'your-fun-asr-api-key'
        : stryMutAct_9fa48('313')
          ? false
          : stryMutAct_9fa48('312')
            ? true
            : (stryCov_9fa48('312', '313', '314'),
              (stryMutAct_9fa48('315') ? apiKey : (stryCov_9fa48('315'), !apiKey)) ||
                (stryMutAct_9fa48('317')
                  ? apiKey !== 'your-fun-asr-api-key'
                  : stryMutAct_9fa48('316')
                    ? false
                    : (stryCov_9fa48('316', '317'),
                      apiKey ===
                        (stryMutAct_9fa48('318')
                          ? ''
                          : (stryCov_9fa48('318'), 'your-fun-asr-api-key')))))
    ) {
      if (stryMutAct_9fa48('319')) {
        {
        }
      } else {
        stryCov_9fa48('319');
        return stryMutAct_9fa48('320')
          ? {}
          : (stryCov_9fa48('320'),
            {
              text: stryMutAct_9fa48('321') ? 'Stryker was here!' : (stryCov_9fa48('321'), ''),
              success: stryMutAct_9fa48('322') ? true : (stryCov_9fa48('322'), false),
              error: stryMutAct_9fa48('323')
                ? ''
                : (stryCov_9fa48('323'), 'API key not configured'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('324')) {
        {
        }
      } else {
        stryCov_9fa48('324');
        const response = await fetch(
          ASR_API_URL,
          stryMutAct_9fa48('325')
            ? {}
            : (stryCov_9fa48('325'),
              {
                method: stryMutAct_9fa48('326') ? '' : (stryCov_9fa48('326'), 'POST'),
                headers: stryMutAct_9fa48('327')
                  ? {}
                  : (stryCov_9fa48('327'),
                    {
                      Authorization: stryMutAct_9fa48('328')
                        ? ``
                        : (stryCov_9fa48('328'), `Bearer ${apiKey}`),
                      'Content-Type': stryMutAct_9fa48('329')
                        ? ''
                        : (stryCov_9fa48('329'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('330')
                    ? {}
                    : (stryCov_9fa48('330'),
                      {
                        model: stryMutAct_9fa48('331')
                          ? ''
                          : (stryCov_9fa48('331'), 'paraformer-v2'),
                        file_urls: stryMutAct_9fa48('332')
                          ? []
                          : (stryCov_9fa48('332'), [audioUrl]),
                      })
                ),
                signal: AbortSignal.timeout(30000),
              })
        );
        if (
          stryMutAct_9fa48('335')
            ? false
            : stryMutAct_9fa48('334')
              ? true
              : stryMutAct_9fa48('333')
                ? response.ok
                : (stryCov_9fa48('333', '334', '335'), !response.ok)
        ) {
          if (stryMutAct_9fa48('336')) {
            {
            }
          } else {
            stryCov_9fa48('336');
            const errMsg = stryMutAct_9fa48('337')
              ? ``
              : (stryCov_9fa48('337'), `ASR API error: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('338')
              ? {}
              : (stryCov_9fa48('338'),
                {
                  text: stryMutAct_9fa48('339') ? 'Stryker was here!' : (stryCov_9fa48('339'), ''),
                  success: stryMutAct_9fa48('340') ? true : (stryCov_9fa48('340'), false),
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
        const text = stryMutAct_9fa48('343')
          ? data?.data?.results?.[0]?.transcription?.text && ''
          : stryMutAct_9fa48('342')
            ? false
            : stryMutAct_9fa48('341')
              ? true
              : (stryCov_9fa48('341', '342', '343'),
                (stryMutAct_9fa48('348')
                  ? data.data?.results?.[0]?.transcription?.text
                  : stryMutAct_9fa48('347')
                    ? data?.data.results?.[0]?.transcription?.text
                    : stryMutAct_9fa48('346')
                      ? data?.data?.results[0]?.transcription?.text
                      : stryMutAct_9fa48('345')
                        ? data?.data?.results?.[0].transcription?.text
                        : stryMutAct_9fa48('344')
                          ? data?.data?.results?.[0]?.transcription.text
                          : (stryCov_9fa48('344', '345', '346', '347', '348'),
                            data?.data?.results?.[0]?.transcription?.text)) ||
                  (stryMutAct_9fa48('349') ? 'Stryker was here!' : (stryCov_9fa48('349'), '')));
        info(
          stryMutAct_9fa48('350') ? '' : (stryCov_9fa48('350'), 'ASR transcription completed'),
          stryMutAct_9fa48('351')
            ? {}
            : (stryCov_9fa48('351'),
              {
                textLength: text.length,
              })
        );
        return stryMutAct_9fa48('352')
          ? {}
          : (stryCov_9fa48('352'),
            {
              text,
              success: stryMutAct_9fa48('353') ? false : (stryCov_9fa48('353'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('354')) {
        {
        }
      } else {
        stryCov_9fa48('354');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('355')
              ? ''
              : (stryCov_9fa48('355'), 'Unknown ASR error');
        error(
          stryMutAct_9fa48('356') ? '' : (stryCov_9fa48('356'), 'ASR transcription failed'),
          stryMutAct_9fa48('357')
            ? {}
            : (stryCov_9fa48('357'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('358')
          ? {}
          : (stryCov_9fa48('358'),
            {
              text: stryMutAct_9fa48('359') ? 'Stryker was here!' : (stryCov_9fa48('359'), ''),
              success: stryMutAct_9fa48('360') ? true : (stryCov_9fa48('360'), false),
              error: errMsg,
            });
      }
    }
  }
}
export function isASRConfigured(): boolean {
  if (stryMutAct_9fa48('361')) {
    {
    }
  } else {
    stryCov_9fa48('361');
    const apiKey = process.env.FUN_ASR_API_KEY;
    return stryMutAct_9fa48('364')
      ? !!apiKey || apiKey !== 'your-fun-asr-api-key'
      : stryMutAct_9fa48('363')
        ? false
        : stryMutAct_9fa48('362')
          ? true
          : (stryCov_9fa48('362', '363', '364'),
            (stryMutAct_9fa48('365')
              ? !apiKey
              : (stryCov_9fa48('365'),
                !(stryMutAct_9fa48('366') ? apiKey : (stryCov_9fa48('366'), !apiKey)))) &&
              (stryMutAct_9fa48('368')
                ? apiKey === 'your-fun-asr-api-key'
                : stryMutAct_9fa48('367')
                  ? true
                  : (stryCov_9fa48('367', '368'),
                    apiKey !==
                      (stryMutAct_9fa48('369')
                        ? ''
                        : (stryCov_9fa48('369'), 'your-fun-asr-api-key')))));
  }
}
