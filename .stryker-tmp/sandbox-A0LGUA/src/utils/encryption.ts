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
import crypto from 'node:crypto';
const ALGORITHM = stryMutAct_9fa48('3984') ? '' : (stryCov_9fa48('3984'), 'aes-256-gcm');
const IV_LENGTH = 16;
function getKey(): Buffer {
  if (stryMutAct_9fa48('3985')) {
    {
    }
  } else {
    stryCov_9fa48('3985');
    const keyHex = stryMutAct_9fa48('3988')
      ? process.env.ENCRYPTION_KEY &&
        '0000000000000000000000000000000000000000000000000000000000000000'
      : stryMutAct_9fa48('3987')
        ? false
        : stryMutAct_9fa48('3986')
          ? true
          : (stryCov_9fa48('3986', '3987', '3988'),
            process.env.ENCRYPTION_KEY ||
              (stryMutAct_9fa48('3989')
                ? ''
                : (stryCov_9fa48('3989'),
                  '0000000000000000000000000000000000000000000000000000000000000000')));
    return Buffer.from(keyHex, stryMutAct_9fa48('3990') ? '' : (stryCov_9fa48('3990'), 'hex'));
  }
}
export function encrypt(plaintext: string): string {
  if (stryMutAct_9fa48('3991')) {
    {
    }
  } else {
    stryCov_9fa48('3991');
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(
      plaintext,
      stryMutAct_9fa48('3992') ? '' : (stryCov_9fa48('3992'), 'utf8'),
      stryMutAct_9fa48('3993') ? '' : (stryCov_9fa48('3993'), 'hex')
    );
    stryMutAct_9fa48('3994')
      ? (encrypted -= cipher.final('hex'))
      : (stryCov_9fa48('3994'),
        (encrypted += cipher.final(
          stryMutAct_9fa48('3995') ? '' : (stryCov_9fa48('3995'), 'hex')
        )));
    const authTag = cipher.getAuthTag();
    return stryMutAct_9fa48('3996')
      ? ``
      : (stryCov_9fa48('3996'),
        `${iv.toString(stryMutAct_9fa48('3997') ? '' : (stryCov_9fa48('3997'), 'hex'))}:${authTag.toString(stryMutAct_9fa48('3998') ? '' : (stryCov_9fa48('3998'), 'hex'))}:${encrypted}`);
  }
}
export function decrypt(ciphertext: string): string {
  if (stryMutAct_9fa48('3999')) {
    {
    }
  } else {
    stryCov_9fa48('3999');
    const key = getKey();
    const parts = ciphertext.split(stryMutAct_9fa48('4000') ? '' : (stryCov_9fa48('4000'), ':'));
    if (
      stryMutAct_9fa48('4003')
        ? parts.length === 3
        : stryMutAct_9fa48('4002')
          ? false
          : stryMutAct_9fa48('4001')
            ? true
            : (stryCov_9fa48('4001', '4002', '4003'), parts.length !== 3)
    ) {
      if (stryMutAct_9fa48('4004')) {
        {
        }
      } else {
        stryCov_9fa48('4004');
        throw new Error(
          stryMutAct_9fa48('4005') ? '' : (stryCov_9fa48('4005'), 'Invalid ciphertext format')
        );
      }
    }
    const iv = Buffer.from(
      parts[0],
      stryMutAct_9fa48('4006') ? '' : (stryCov_9fa48('4006'), 'hex')
    );
    const authTag = Buffer.from(
      parts[1],
      stryMutAct_9fa48('4007') ? '' : (stryCov_9fa48('4007'), 'hex')
    );
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(
      encrypted,
      stryMutAct_9fa48('4008') ? '' : (stryCov_9fa48('4008'), 'hex'),
      stryMutAct_9fa48('4009') ? '' : (stryCov_9fa48('4009'), 'utf8')
    );
    stryMutAct_9fa48('4010')
      ? (decrypted -= decipher.final('utf8'))
      : (stryCov_9fa48('4010'),
        (decrypted += decipher.final(
          stryMutAct_9fa48('4011') ? '' : (stryCov_9fa48('4011'), 'utf8')
        )));
    return decrypted;
  }
}
