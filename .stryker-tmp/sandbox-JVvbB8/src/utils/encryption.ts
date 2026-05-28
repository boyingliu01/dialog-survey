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
const ALGORITHM = stryMutAct_9fa48('863') ? '' : (stryCov_9fa48('863'), 'aes-256-gcm');
const IV_LENGTH = 16;
function getKey(): Buffer {
  if (stryMutAct_9fa48('864')) {
    {
    }
  } else {
    stryCov_9fa48('864');
    const keyHex = stryMutAct_9fa48('867')
      ? process.env.ENCRYPTION_KEY &&
        '0000000000000000000000000000000000000000000000000000000000000000'
      : stryMutAct_9fa48('866')
        ? false
        : stryMutAct_9fa48('865')
          ? true
          : (stryCov_9fa48('865', '866', '867'),
            process.env.ENCRYPTION_KEY ||
              (stryMutAct_9fa48('868')
                ? ''
                : (stryCov_9fa48('868'),
                  '0000000000000000000000000000000000000000000000000000000000000000')));
    return Buffer.from(keyHex, stryMutAct_9fa48('869') ? '' : (stryCov_9fa48('869'), 'hex'));
  }
}
export function encrypt(plaintext: string): string {
  if (stryMutAct_9fa48('870')) {
    {
    }
  } else {
    stryCov_9fa48('870');
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(
      plaintext,
      stryMutAct_9fa48('871') ? '' : (stryCov_9fa48('871'), 'utf8'),
      stryMutAct_9fa48('872') ? '' : (stryCov_9fa48('872'), 'hex')
    );
    stryMutAct_9fa48('873')
      ? (encrypted -= cipher.final('hex'))
      : (stryCov_9fa48('873'),
        (encrypted += cipher.final(stryMutAct_9fa48('874') ? '' : (stryCov_9fa48('874'), 'hex'))));
    const authTag = cipher.getAuthTag();
    return stryMutAct_9fa48('875')
      ? ``
      : (stryCov_9fa48('875'),
        `${iv.toString(stryMutAct_9fa48('876') ? '' : (stryCov_9fa48('876'), 'hex'))}:${authTag.toString(stryMutAct_9fa48('877') ? '' : (stryCov_9fa48('877'), 'hex'))}:${encrypted}`);
  }
}
export function decrypt(ciphertext: string): string {
  if (stryMutAct_9fa48('878')) {
    {
    }
  } else {
    stryCov_9fa48('878');
    const key = getKey();
    const parts = ciphertext.split(stryMutAct_9fa48('879') ? '' : (stryCov_9fa48('879'), ':'));
    if (
      stryMutAct_9fa48('882')
        ? parts.length === 3
        : stryMutAct_9fa48('881')
          ? false
          : stryMutAct_9fa48('880')
            ? true
            : (stryCov_9fa48('880', '881', '882'), parts.length !== 3)
    ) {
      if (stryMutAct_9fa48('883')) {
        {
        }
      } else {
        stryCov_9fa48('883');
        throw new Error(
          stryMutAct_9fa48('884') ? '' : (stryCov_9fa48('884'), 'Invalid ciphertext format')
        );
      }
    }
    const iv = Buffer.from(parts[0], stryMutAct_9fa48('885') ? '' : (stryCov_9fa48('885'), 'hex'));
    const authTag = Buffer.from(
      parts[1],
      stryMutAct_9fa48('886') ? '' : (stryCov_9fa48('886'), 'hex')
    );
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(
      encrypted,
      stryMutAct_9fa48('887') ? '' : (stryCov_9fa48('887'), 'hex'),
      stryMutAct_9fa48('888') ? '' : (stryCov_9fa48('888'), 'utf8')
    );
    stryMutAct_9fa48('889')
      ? (decrypted -= decipher.final('utf8'))
      : (stryCov_9fa48('889'),
        (decrypted += decipher.final(
          stryMutAct_9fa48('890') ? '' : (stryCov_9fa48('890'), 'utf8')
        )));
    return decrypted;
  }
}
