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
const ALGORITHM = stryMutAct_9fa48('573') ? '' : (stryCov_9fa48('573'), 'aes-256-gcm');
const IV_LENGTH = 16;
function getKey(): Buffer {
  if (stryMutAct_9fa48('574')) {
    {
    }
  } else {
    stryCov_9fa48('574');
    const keyHex = stryMutAct_9fa48('577')
      ? process.env.ENCRYPTION_KEY &&
        '0000000000000000000000000000000000000000000000000000000000000000'
      : stryMutAct_9fa48('576')
        ? false
        : stryMutAct_9fa48('575')
          ? true
          : (stryCov_9fa48('575', '576', '577'),
            process.env.ENCRYPTION_KEY ||
              (stryMutAct_9fa48('578')
                ? ''
                : (stryCov_9fa48('578'),
                  '0000000000000000000000000000000000000000000000000000000000000000')));
    return Buffer.from(keyHex, stryMutAct_9fa48('579') ? '' : (stryCov_9fa48('579'), 'hex'));
  }
}
export function encrypt(plaintext: string): string {
  if (stryMutAct_9fa48('580')) {
    {
    }
  } else {
    stryCov_9fa48('580');
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(
      plaintext,
      stryMutAct_9fa48('581') ? '' : (stryCov_9fa48('581'), 'utf8'),
      stryMutAct_9fa48('582') ? '' : (stryCov_9fa48('582'), 'hex')
    );
    stryMutAct_9fa48('583')
      ? (encrypted -= cipher.final('hex'))
      : (stryCov_9fa48('583'),
        (encrypted += cipher.final(stryMutAct_9fa48('584') ? '' : (stryCov_9fa48('584'), 'hex'))));
    const authTag = cipher.getAuthTag();
    return stryMutAct_9fa48('585')
      ? ``
      : (stryCov_9fa48('585'),
        `${iv.toString(stryMutAct_9fa48('586') ? '' : (stryCov_9fa48('586'), 'hex'))}:${authTag.toString(stryMutAct_9fa48('587') ? '' : (stryCov_9fa48('587'), 'hex'))}:${encrypted}`);
  }
}
export function decrypt(ciphertext: string): string {
  if (stryMutAct_9fa48('588')) {
    {
    }
  } else {
    stryCov_9fa48('588');
    const key = getKey();
    const parts = ciphertext.split(stryMutAct_9fa48('589') ? '' : (stryCov_9fa48('589'), ':'));
    if (
      stryMutAct_9fa48('592')
        ? parts.length === 3
        : stryMutAct_9fa48('591')
          ? false
          : stryMutAct_9fa48('590')
            ? true
            : (stryCov_9fa48('590', '591', '592'), parts.length !== 3)
    ) {
      if (stryMutAct_9fa48('593')) {
        {
        }
      } else {
        stryCov_9fa48('593');
        throw new Error(
          stryMutAct_9fa48('594') ? '' : (stryCov_9fa48('594'), 'Invalid ciphertext format')
        );
      }
    }
    const iv = Buffer.from(parts[0], stryMutAct_9fa48('595') ? '' : (stryCov_9fa48('595'), 'hex'));
    const authTag = Buffer.from(
      parts[1],
      stryMutAct_9fa48('596') ? '' : (stryCov_9fa48('596'), 'hex')
    );
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(
      encrypted,
      stryMutAct_9fa48('597') ? '' : (stryCov_9fa48('597'), 'hex'),
      stryMutAct_9fa48('598') ? '' : (stryCov_9fa48('598'), 'utf8')
    );
    stryMutAct_9fa48('599')
      ? (decrypted -= decipher.final('utf8'))
      : (stryCov_9fa48('599'),
        (decrypted += decipher.final(
          stryMutAct_9fa48('600') ? '' : (stryCov_9fa48('600'), 'utf8')
        )));
    return decrypted;
  }
}
