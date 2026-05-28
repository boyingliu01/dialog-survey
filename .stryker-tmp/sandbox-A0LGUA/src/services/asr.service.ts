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
const ASR_API_URL = stryMutAct_9fa48('2654')
  ? ''
  : (stryCov_9fa48('2654'),
    'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription');
interface ASRResult {
  text: string;
  success: boolean;
  error?: string;
}
export async function transcribeAudio(audioUrl: string): Promise<ASRResult> {
  if (stryMutAct_9fa48('2655')) {
    {
    }
  } else {
    stryCov_9fa48('2655');
    const apiKey = process.env.FUN_ASR_API_KEY;
    if (
      stryMutAct_9fa48('2658')
        ? !apiKey && apiKey === 'your-fun-asr-api-key'
        : stryMutAct_9fa48('2657')
          ? false
          : stryMutAct_9fa48('2656')
            ? true
            : (stryCov_9fa48('2656', '2657', '2658'),
              (stryMutAct_9fa48('2659') ? apiKey : (stryCov_9fa48('2659'), !apiKey)) ||
                (stryMutAct_9fa48('2661')
                  ? apiKey !== 'your-fun-asr-api-key'
                  : stryMutAct_9fa48('2660')
                    ? false
                    : (stryCov_9fa48('2660', '2661'),
                      apiKey ===
                        (stryMutAct_9fa48('2662')
                          ? ''
                          : (stryCov_9fa48('2662'), 'your-fun-asr-api-key')))))
    ) {
      if (stryMutAct_9fa48('2663')) {
        {
        }
      } else {
        stryCov_9fa48('2663');
        return stryMutAct_9fa48('2664')
          ? {}
          : (stryCov_9fa48('2664'),
            {
              text: stryMutAct_9fa48('2665') ? 'Stryker was here!' : (stryCov_9fa48('2665'), ''),
              success: stryMutAct_9fa48('2666') ? true : (stryCov_9fa48('2666'), false),
              error: stryMutAct_9fa48('2667')
                ? ''
                : (stryCov_9fa48('2667'), 'API key not configured'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('2668')) {
        {
        }
      } else {
        stryCov_9fa48('2668');
        const response = await fetch(
          ASR_API_URL,
          stryMutAct_9fa48('2669')
            ? {}
            : (stryCov_9fa48('2669'),
              {
                method: stryMutAct_9fa48('2670') ? '' : (stryCov_9fa48('2670'), 'POST'),
                headers: stryMutAct_9fa48('2671')
                  ? {}
                  : (stryCov_9fa48('2671'),
                    {
                      Authorization: stryMutAct_9fa48('2672')
                        ? ``
                        : (stryCov_9fa48('2672'), `Bearer ${apiKey}`),
                      'Content-Type': stryMutAct_9fa48('2673')
                        ? ''
                        : (stryCov_9fa48('2673'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('2674')
                    ? {}
                    : (stryCov_9fa48('2674'),
                      {
                        model: stryMutAct_9fa48('2675')
                          ? ''
                          : (stryCov_9fa48('2675'), 'paraformer-v2'),
                        file_urls: stryMutAct_9fa48('2676')
                          ? []
                          : (stryCov_9fa48('2676'), [audioUrl]),
                      })
                ),
                signal: AbortSignal.timeout(30000),
              })
        );
        if (
          stryMutAct_9fa48('2679')
            ? false
            : stryMutAct_9fa48('2678')
              ? true
              : stryMutAct_9fa48('2677')
                ? response.ok
                : (stryCov_9fa48('2677', '2678', '2679'), !response.ok)
        ) {
          if (stryMutAct_9fa48('2680')) {
            {
            }
          } else {
            stryCov_9fa48('2680');
            const errMsg = stryMutAct_9fa48('2681')
              ? ``
              : (stryCov_9fa48('2681'), `ASR API error: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('2682')
              ? {}
              : (stryCov_9fa48('2682'),
                {
                  text: stryMutAct_9fa48('2683')
                    ? 'Stryker was here!'
                    : (stryCov_9fa48('2683'), ''),
                  success: stryMutAct_9fa48('2684') ? true : (stryCov_9fa48('2684'), false),
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
        const text = stryMutAct_9fa48('2687')
          ? data?.data?.results?.[0]?.transcription?.text && ''
          : stryMutAct_9fa48('2686')
            ? false
            : stryMutAct_9fa48('2685')
              ? true
              : (stryCov_9fa48('2685', '2686', '2687'),
                (stryMutAct_9fa48('2692')
                  ? data.data?.results?.[0]?.transcription?.text
                  : stryMutAct_9fa48('2691')
                    ? data?.data.results?.[0]?.transcription?.text
                    : stryMutAct_9fa48('2690')
                      ? data?.data?.results[0]?.transcription?.text
                      : stryMutAct_9fa48('2689')
                        ? data?.data?.results?.[0].transcription?.text
                        : stryMutAct_9fa48('2688')
                          ? data?.data?.results?.[0]?.transcription.text
                          : (stryCov_9fa48('2688', '2689', '2690', '2691', '2692'),
                            data?.data?.results?.[0]?.transcription?.text)) ||
                  (stryMutAct_9fa48('2693') ? 'Stryker was here!' : (stryCov_9fa48('2693'), '')));
        info(
          stryMutAct_9fa48('2694') ? '' : (stryCov_9fa48('2694'), 'ASR transcription completed'),
          stryMutAct_9fa48('2695')
            ? {}
            : (stryCov_9fa48('2695'),
              {
                textLength: text.length,
              })
        );
        return stryMutAct_9fa48('2696')
          ? {}
          : (stryCov_9fa48('2696'),
            {
              text,
              success: stryMutAct_9fa48('2697') ? false : (stryCov_9fa48('2697'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('2698')) {
        {
        }
      } else {
        stryCov_9fa48('2698');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('2699')
              ? ''
              : (stryCov_9fa48('2699'), 'Unknown ASR error');
        error(
          stryMutAct_9fa48('2700') ? '' : (stryCov_9fa48('2700'), 'ASR transcription failed'),
          stryMutAct_9fa48('2701')
            ? {}
            : (stryCov_9fa48('2701'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('2702')
          ? {}
          : (stryCov_9fa48('2702'),
            {
              text: stryMutAct_9fa48('2703') ? 'Stryker was here!' : (stryCov_9fa48('2703'), ''),
              success: stryMutAct_9fa48('2704') ? true : (stryCov_9fa48('2704'), false),
              error: errMsg,
            });
      }
    }
  }
}
export function isASRConfigured(): boolean {
  if (stryMutAct_9fa48('2705')) {
    {
    }
  } else {
    stryCov_9fa48('2705');
    const apiKey = process.env.FUN_ASR_API_KEY;
    return stryMutAct_9fa48('2708')
      ? !!apiKey || apiKey !== 'your-fun-asr-api-key'
      : stryMutAct_9fa48('2707')
        ? false
        : stryMutAct_9fa48('2706')
          ? true
          : (stryCov_9fa48('2706', '2707', '2708'),
            (stryMutAct_9fa48('2709')
              ? !apiKey
              : (stryCov_9fa48('2709'),
                !(stryMutAct_9fa48('2710') ? apiKey : (stryCov_9fa48('2710'), !apiKey)))) &&
              (stryMutAct_9fa48('2712')
                ? apiKey === 'your-fun-asr-api-key'
                : stryMutAct_9fa48('2711')
                  ? true
                  : (stryCov_9fa48('2711', '2712'),
                    apiKey !==
                      (stryMutAct_9fa48('2713')
                        ? ''
                        : (stryCov_9fa48('2713'), 'your-fun-asr-api-key')))));
  }
}
