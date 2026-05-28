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
export const dimensionSchema = z.object(
  stryMutAct_9fa48('2351')
    ? {}
    : (stryCov_9fa48('2351'),
      {
        id: stryMutAct_9fa48('2352')
          ? z.string().max(1)
          : (stryCov_9fa48('2352'), z.string().min(1)),
        label: stryMutAct_9fa48('2353')
          ? z.string().max(1)
          : (stryCov_9fa48('2353'), z.string().min(1)),
        description: z.string().optional(),
        keywords: z
          .array(z.string())
          .default(stryMutAct_9fa48('2354') ? ['Stryker was here'] : (stryCov_9fa48('2354'), [])),
      })
);
export const dimensionsArraySchema = z.array(dimensionSchema);
export const analysisConfigSchema = z.object(
  stryMutAct_9fa48('2355')
    ? {}
    : (stryCov_9fa48('2355'),
      {
        emergentThreshold: stryMutAct_9fa48('2356')
          ? z.number().int().max(1).optional()
          : (stryCov_9fa48('2356'), z.number().int().min(1).optional()),
        customSentimentWords: z
          .object(
            stryMutAct_9fa48('2357')
              ? {}
              : (stryCov_9fa48('2357'),
                {
                  positive: z
                    .array(z.string())
                    .default(
                      stryMutAct_9fa48('2358') ? ['Stryker was here'] : (stryCov_9fa48('2358'), [])
                    ),
                  negative: z
                    .array(z.string())
                    .default(
                      stryMutAct_9fa48('2359') ? ['Stryker was here'] : (stryCov_9fa48('2359'), [])
                    ),
                })
          )
          .optional(),
      })
);
export const dimensionTagSchema = z.object(
  stryMutAct_9fa48('2360')
    ? {}
    : (stryCov_9fa48('2360'),
      {
        dimensionId: stryMutAct_9fa48('2361')
          ? z.string().max(1)
          : (stryCov_9fa48('2361'), z.string().min(1)),
        label: stryMutAct_9fa48('2362')
          ? z.string().max(1)
          : (stryCov_9fa48('2362'), z.string().min(1)),
        sentiment: z.enum(
          stryMutAct_9fa48('2363')
            ? []
            : (stryCov_9fa48('2363'),
              [
                stryMutAct_9fa48('2364') ? '' : (stryCov_9fa48('2364'), 'positive'),
                stryMutAct_9fa48('2365') ? '' : (stryCov_9fa48('2365'), 'negative'),
                stryMutAct_9fa48('2366') ? '' : (stryCov_9fa48('2366'), 'neutral'),
              ])
        ),
        quotes: z
          .array(z.string())
          .default(stryMutAct_9fa48('2367') ? ['Stryker was here'] : (stryCov_9fa48('2367'), [])),
      })
);
export const dimensionTagsArraySchema = z.array(dimensionTagSchema);
export function validateDimensions(input: string | null) {
  if (stryMutAct_9fa48('2368')) {
    {
    }
  } else {
    stryCov_9fa48('2368');
    if (
      stryMutAct_9fa48('2371')
        ? input === null && input === ''
        : stryMutAct_9fa48('2370')
          ? false
          : stryMutAct_9fa48('2369')
            ? true
            : (stryCov_9fa48('2369', '2370', '2371'),
              (stryMutAct_9fa48('2373')
                ? input !== null
                : stryMutAct_9fa48('2372')
                  ? false
                  : (stryCov_9fa48('2372', '2373'), input === null)) ||
                (stryMutAct_9fa48('2375')
                  ? input !== ''
                  : stryMutAct_9fa48('2374')
                    ? false
                    : (stryCov_9fa48('2374', '2375'),
                      input ===
                        (stryMutAct_9fa48('2376')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('2376'), '')))))
    ) {
      if (stryMutAct_9fa48('2377')) {
        {
        }
      } else {
        stryCov_9fa48('2377');
        return stryMutAct_9fa48('2378')
          ? {}
          : (stryCov_9fa48('2378'),
            {
              success: true as const,
              data: stryMutAct_9fa48('2379') ? ['Stryker was here'] : (stryCov_9fa48('2379'), []),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('2380')) {
        {
        }
      } else {
        stryCov_9fa48('2380');
        const parsed = JSON.parse(input);
        return dimensionsArraySchema.safeParse(parsed);
      }
    } catch {
      if (stryMutAct_9fa48('2381')) {
        {
        }
      } else {
        stryCov_9fa48('2381');
        return stryMutAct_9fa48('2382')
          ? {}
          : (stryCov_9fa48('2382'),
            {
              success: false as const,
              error: new z.ZodError(
                stryMutAct_9fa48('2383') ? ['Stryker was here'] : (stryCov_9fa48('2383'), [])
              ),
            });
      }
    }
  }
}
export function validateDimensionTags(
  input:
    | string
    | {
        dimensionId: string;
        label: string;
        sentiment: string;
        quotes: string[];
      }[]
    | null
) {
  if (stryMutAct_9fa48('2384')) {
    {
    }
  } else {
    stryCov_9fa48('2384');
    if (
      stryMutAct_9fa48('2387')
        ? input !== null
        : stryMutAct_9fa48('2386')
          ? false
          : stryMutAct_9fa48('2385')
            ? true
            : (stryCov_9fa48('2385', '2386', '2387'), input === null)
    ) {
      if (stryMutAct_9fa48('2388')) {
        {
        }
      } else {
        stryCov_9fa48('2388');
        return stryMutAct_9fa48('2389')
          ? {}
          : (stryCov_9fa48('2389'),
            {
              success: true as const,
              data: stryMutAct_9fa48('2390') ? ['Stryker was here'] : (stryCov_9fa48('2390'), []),
            });
      }
    }
    const raw = (
      stryMutAct_9fa48('2393')
        ? typeof input !== 'string'
        : stryMutAct_9fa48('2392')
          ? false
          : stryMutAct_9fa48('2391')
            ? true
            : (stryCov_9fa48('2391', '2392', '2393'),
              typeof input === (stryMutAct_9fa48('2394') ? '' : (stryCov_9fa48('2394'), 'string')))
    )
      ? JSON.parse(input)
      : input;
    return dimensionTagsArraySchema.safeParse(raw);
  }
}
