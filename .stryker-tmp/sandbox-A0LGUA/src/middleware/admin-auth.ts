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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { error, info } from '../utils/logger.js';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const UNPROTECTED_METHODS = new Set<string>(
  stryMutAct_9fa48('1915')
    ? []
    : (stryCov_9fa48('1915'),
      [
        stryMutAct_9fa48('1916') ? '' : (stryCov_9fa48('1916'), 'GET'),
        stryMutAct_9fa48('1917') ? '' : (stryCov_9fa48('1917'), 'HEAD'),
        stryMutAct_9fa48('1918') ? '' : (stryCov_9fa48('1918'), 'OPTIONS'),
      ])
);
export async function adminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (stryMutAct_9fa48('1919')) {
    {
    }
  } else {
    stryCov_9fa48('1919');
    if (
      stryMutAct_9fa48('1921')
        ? false
        : stryMutAct_9fa48('1920')
          ? true
          : (stryCov_9fa48('1920', '1921'), UNPROTECTED_METHODS.has(request.method))
    ) {
      if (stryMutAct_9fa48('1922')) {
        {
        }
      } else {
        stryCov_9fa48('1922');
        return;
      }
    }
    const providedKey =
      request.headers[stryMutAct_9fa48('1923') ? '' : (stryCov_9fa48('1923'), 'x-admin-key')];
    if (
      stryMutAct_9fa48('1926')
        ? false
        : stryMutAct_9fa48('1925')
          ? true
          : stryMutAct_9fa48('1924')
            ? ADMIN_API_KEY
            : (stryCov_9fa48('1924', '1925', '1926'), !ADMIN_API_KEY)
    ) {
      if (stryMutAct_9fa48('1927')) {
        {
        }
      } else {
        stryCov_9fa48('1927');
        error(
          stryMutAct_9fa48('1928')
            ? ''
            : (stryCov_9fa48('1928'), 'Admin authentication failed: ADMIN_API_KEY not configured'),
          stryMutAct_9fa48('1929')
            ? {}
            : (stryCov_9fa48('1929'),
              {
                method: request.method,
                url: request.url,
              })
        );
        void reply
          .code(500)
          .type(stryMutAct_9fa48('1930') ? '' : (stryCov_9fa48('1930'), 'text/html'))
          .send(
            stryMutAct_9fa48('1931')
              ? ''
              : (stryCov_9fa48('1931'),
                '<div class="text-red-600">服务器配置错误：ADMIN_API_KEY 未设置</div>')
          );
        return;
      }
    }
    if (
      stryMutAct_9fa48('1934')
        ? providedKey === ADMIN_API_KEY
        : stryMutAct_9fa48('1933')
          ? false
          : stryMutAct_9fa48('1932')
            ? true
            : (stryCov_9fa48('1932', '1933', '1934'), providedKey !== ADMIN_API_KEY)
    ) {
      if (stryMutAct_9fa48('1935')) {
        {
        }
      } else {
        stryCov_9fa48('1935');
        error(
          stryMutAct_9fa48('1936') ? '' : (stryCov_9fa48('1936'), 'Admin authentication failed'),
          stryMutAct_9fa48('1937')
            ? {}
            : (stryCov_9fa48('1937'),
              {
                method: request.method,
                url: request.url,
                hasKey: stryMutAct_9fa48('1940')
                  ? providedKey === undefined
                  : stryMutAct_9fa48('1939')
                    ? false
                    : stryMutAct_9fa48('1938')
                      ? true
                      : (stryCov_9fa48('1938', '1939', '1940'), providedKey !== undefined),
              })
        );
        void reply
          .code(401)
          .type(stryMutAct_9fa48('1941') ? '' : (stryCov_9fa48('1941'), 'text/html'))
          .send(
            stryMutAct_9fa48('1942')
              ? ''
              : (stryCov_9fa48('1942'),
                '<div class="text-red-600">认证失败：无效的 Admin API Key</div>')
          );
        return;
      }
    }
    info(
      stryMutAct_9fa48('1943') ? '' : (stryCov_9fa48('1943'), 'Authenticated admin request'),
      stryMutAct_9fa48('1944')
        ? {}
        : (stryCov_9fa48('1944'),
          {
            method: request.method,
            url: request.url,
          })
    );
  }
}
