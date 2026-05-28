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
const ALGORITHM = stryMutAct_9fa48('390') ? '' : (stryCov_9fa48('390'), 'aes-256-gcm');
const IV_LENGTH = 16;
function getKey(): Buffer {
  if (stryMutAct_9fa48('391')) {
    {
    }
  } else {
    stryCov_9fa48('391');
    const keyHex = stryMutAct_9fa48('394')
      ? process.env.ENCRYPTION_KEY &&
        '0000000000000000000000000000000000000000000000000000000000000000'
      : stryMutAct_9fa48('393')
        ? false
        : stryMutAct_9fa48('392')
          ? true
          : (stryCov_9fa48('392', '393', '394'),
            process.env.ENCRYPTION_KEY ||
              (stryMutAct_9fa48('395')
                ? ''
                : (stryCov_9fa48('395'),
                  '0000000000000000000000000000000000000000000000000000000000000000')));
    return Buffer.from(keyHex, stryMutAct_9fa48('396') ? '' : (stryCov_9fa48('396'), 'hex'));
  }
}
export function encrypt(plaintext: string): string {
  if (stryMutAct_9fa48('397')) {
    {
    }
  } else {
    stryCov_9fa48('397');
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(
      plaintext,
      stryMutAct_9fa48('398') ? '' : (stryCov_9fa48('398'), 'utf8'),
      stryMutAct_9fa48('399') ? '' : (stryCov_9fa48('399'), 'hex')
    );
    stryMutAct_9fa48('400')
      ? (encrypted -= cipher.final('hex'))
      : (stryCov_9fa48('400'),
        (encrypted += cipher.final(stryMutAct_9fa48('401') ? '' : (stryCov_9fa48('401'), 'hex'))));
    const authTag = cipher.getAuthTag();
    return stryMutAct_9fa48('402')
      ? ``
      : (stryCov_9fa48('402'),
        `${iv.toString(stryMutAct_9fa48('403') ? '' : (stryCov_9fa48('403'), 'hex'))}:${authTag.toString(stryMutAct_9fa48('404') ? '' : (stryCov_9fa48('404'), 'hex'))}:${encrypted}`);
  }
}
export function decrypt(ciphertext: string): string {
  if (stryMutAct_9fa48('405')) {
    {
    }
  } else {
    stryCov_9fa48('405');
    const key = getKey();
    const parts = ciphertext.split(stryMutAct_9fa48('406') ? '' : (stryCov_9fa48('406'), ':'));
    if (
      stryMutAct_9fa48('409')
        ? parts.length === 3
        : stryMutAct_9fa48('408')
          ? false
          : stryMutAct_9fa48('407')
            ? true
            : (stryCov_9fa48('407', '408', '409'), parts.length !== 3)
    ) {
      if (stryMutAct_9fa48('410')) {
        {
        }
      } else {
        stryCov_9fa48('410');
        throw new Error(
          stryMutAct_9fa48('411') ? '' : (stryCov_9fa48('411'), 'Invalid ciphertext format')
        );
      }
    }
    const iv = Buffer.from(parts[0], stryMutAct_9fa48('412') ? '' : (stryCov_9fa48('412'), 'hex'));
    const authTag = Buffer.from(
      parts[1],
      stryMutAct_9fa48('413') ? '' : (stryCov_9fa48('413'), 'hex')
    );
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(
      encrypted,
      stryMutAct_9fa48('414') ? '' : (stryCov_9fa48('414'), 'hex'),
      stryMutAct_9fa48('415') ? '' : (stryCov_9fa48('415'), 'utf8')
    );
    stryMutAct_9fa48('416')
      ? (decrypted -= decipher.final('utf8'))
      : (stryCov_9fa48('416'),
        (decrypted += decipher.final(
          stryMutAct_9fa48('417') ? '' : (stryCov_9fa48('417'), 'utf8')
        )));
    return decrypted;
  }
}
