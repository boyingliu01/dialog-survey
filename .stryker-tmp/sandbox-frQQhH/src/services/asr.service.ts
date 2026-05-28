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
const ASR_API_URL = stryMutAct_9fa48('191')
  ? ''
  : (stryCov_9fa48('191'),
    'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription');
interface ASRResult {
  text: string;
  success: boolean;
  error?: string;
}
export async function transcribeAudio(audioUrl: string): Promise<ASRResult> {
  if (stryMutAct_9fa48('192')) {
    {
    }
  } else {
    stryCov_9fa48('192');
    const apiKey = process.env.FUN_ASR_API_KEY;
    if (
      stryMutAct_9fa48('195')
        ? !apiKey && apiKey === 'your-fun-asr-api-key'
        : stryMutAct_9fa48('194')
          ? false
          : stryMutAct_9fa48('193')
            ? true
            : (stryCov_9fa48('193', '194', '195'),
              (stryMutAct_9fa48('196') ? apiKey : (stryCov_9fa48('196'), !apiKey)) ||
                (stryMutAct_9fa48('198')
                  ? apiKey !== 'your-fun-asr-api-key'
                  : stryMutAct_9fa48('197')
                    ? false
                    : (stryCov_9fa48('197', '198'),
                      apiKey ===
                        (stryMutAct_9fa48('199')
                          ? ''
                          : (stryCov_9fa48('199'), 'your-fun-asr-api-key')))))
    ) {
      if (stryMutAct_9fa48('200')) {
        {
        }
      } else {
        stryCov_9fa48('200');
        return stryMutAct_9fa48('201')
          ? {}
          : (stryCov_9fa48('201'),
            {
              text: stryMutAct_9fa48('202') ? 'Stryker was here!' : (stryCov_9fa48('202'), ''),
              success: stryMutAct_9fa48('203') ? true : (stryCov_9fa48('203'), false),
              error: stryMutAct_9fa48('204')
                ? ''
                : (stryCov_9fa48('204'), 'API key not configured'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('205')) {
        {
        }
      } else {
        stryCov_9fa48('205');
        const response = await fetch(
          ASR_API_URL,
          stryMutAct_9fa48('206')
            ? {}
            : (stryCov_9fa48('206'),
              {
                method: stryMutAct_9fa48('207') ? '' : (stryCov_9fa48('207'), 'POST'),
                headers: stryMutAct_9fa48('208')
                  ? {}
                  : (stryCov_9fa48('208'),
                    {
                      Authorization: stryMutAct_9fa48('209')
                        ? ``
                        : (stryCov_9fa48('209'), `Bearer ${apiKey}`),
                      'Content-Type': stryMutAct_9fa48('210')
                        ? ''
                        : (stryCov_9fa48('210'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('211')
                    ? {}
                    : (stryCov_9fa48('211'),
                      {
                        model: stryMutAct_9fa48('212')
                          ? ''
                          : (stryCov_9fa48('212'), 'paraformer-v2'),
                        file_urls: stryMutAct_9fa48('213')
                          ? []
                          : (stryCov_9fa48('213'), [audioUrl]),
                      })
                ),
                signal: AbortSignal.timeout(30000),
              })
        );
        if (
          stryMutAct_9fa48('216')
            ? false
            : stryMutAct_9fa48('215')
              ? true
              : stryMutAct_9fa48('214')
                ? response.ok
                : (stryCov_9fa48('214', '215', '216'), !response.ok)
        ) {
          if (stryMutAct_9fa48('217')) {
            {
            }
          } else {
            stryCov_9fa48('217');
            const errMsg = stryMutAct_9fa48('218')
              ? ``
              : (stryCov_9fa48('218'), `ASR API error: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('219')
              ? {}
              : (stryCov_9fa48('219'),
                {
                  text: stryMutAct_9fa48('220') ? 'Stryker was here!' : (stryCov_9fa48('220'), ''),
                  success: stryMutAct_9fa48('221') ? true : (stryCov_9fa48('221'), false),
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
        const text = stryMutAct_9fa48('224')
          ? data?.data?.results?.[0]?.transcription?.text && ''
          : stryMutAct_9fa48('223')
            ? false
            : stryMutAct_9fa48('222')
              ? true
              : (stryCov_9fa48('222', '223', '224'),
                (stryMutAct_9fa48('229')
                  ? data.data?.results?.[0]?.transcription?.text
                  : stryMutAct_9fa48('228')
                    ? data?.data.results?.[0]?.transcription?.text
                    : stryMutAct_9fa48('227')
                      ? data?.data?.results[0]?.transcription?.text
                      : stryMutAct_9fa48('226')
                        ? data?.data?.results?.[0].transcription?.text
                        : stryMutAct_9fa48('225')
                          ? data?.data?.results?.[0]?.transcription.text
                          : (stryCov_9fa48('225', '226', '227', '228', '229'),
                            data?.data?.results?.[0]?.transcription?.text)) ||
                  (stryMutAct_9fa48('230') ? 'Stryker was here!' : (stryCov_9fa48('230'), '')));
        info(
          stryMutAct_9fa48('231') ? '' : (stryCov_9fa48('231'), 'ASR transcription completed'),
          stryMutAct_9fa48('232')
            ? {}
            : (stryCov_9fa48('232'),
              {
                textLength: text.length,
              })
        );
        return stryMutAct_9fa48('233')
          ? {}
          : (stryCov_9fa48('233'),
            {
              text,
              success: stryMutAct_9fa48('234') ? false : (stryCov_9fa48('234'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('235')) {
        {
        }
      } else {
        stryCov_9fa48('235');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('236')
              ? ''
              : (stryCov_9fa48('236'), 'Unknown ASR error');
        error(
          stryMutAct_9fa48('237') ? '' : (stryCov_9fa48('237'), 'ASR transcription failed'),
          stryMutAct_9fa48('238')
            ? {}
            : (stryCov_9fa48('238'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('239')
          ? {}
          : (stryCov_9fa48('239'),
            {
              text: stryMutAct_9fa48('240') ? 'Stryker was here!' : (stryCov_9fa48('240'), ''),
              success: stryMutAct_9fa48('241') ? true : (stryCov_9fa48('241'), false),
              error: errMsg,
            });
      }
    }
  }
}
export function isASRConfigured(): boolean {
  if (stryMutAct_9fa48('242')) {
    {
    }
  } else {
    stryCov_9fa48('242');
    const apiKey = process.env.FUN_ASR_API_KEY;
    return stryMutAct_9fa48('245')
      ? !!apiKey || apiKey !== 'your-fun-asr-api-key'
      : stryMutAct_9fa48('244')
        ? false
        : stryMutAct_9fa48('243')
          ? true
          : (stryCov_9fa48('243', '244', '245'),
            (stryMutAct_9fa48('246')
              ? !apiKey
              : (stryCov_9fa48('246'),
                !(stryMutAct_9fa48('247') ? apiKey : (stryCov_9fa48('247'), !apiKey)))) &&
              (stryMutAct_9fa48('249')
                ? apiKey === 'your-fun-asr-api-key'
                : stryMutAct_9fa48('248')
                  ? true
                  : (stryCov_9fa48('248', '249'),
                    apiKey !==
                      (stryMutAct_9fa48('250')
                        ? ''
                        : (stryCov_9fa48('250'), 'your-fun-asr-api-key')))));
  }
}
