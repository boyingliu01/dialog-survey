import crypto from 'node:crypto';

const TIMESTAMP_TOLERANCE = 300000;

export function verifySignature(timestamp: number, secret: string, signature: string): boolean {
  if (!hasAllParts(timestamp, secret, signature)) return false;
  if (!verifyTimestamp(timestamp)) return false;
  return signaturesMatch(generateSignature(timestamp, secret), signature);
}

/** Every input must be present; an empty signature is never a valid one. */
function hasAllParts(timestamp: number, secret: string, signature: string): boolean {
  return Boolean(timestamp) && Boolean(secret) && Boolean(signature);
}

/**
 * Constant-time comparison of two base64 signatures.
 *
 * The length check is not redundant with `timingSafeEqual` -- that function
 * THROWS when the buffers differ in length -- but it leaks only the length, which
 * a base64 HMAC always has, so it reveals nothing about the secret. Without it a
 * malformed signature would raise instead of returning false, turning a rejected
 * webhook into a 500.
 */
function signaturesMatch(expected: string, actual: string): boolean {
  const bufExpected = Buffer.from(expected);
  const bufActual = Buffer.from(actual);
  return bufExpected.length === bufActual.length && crypto.timingSafeEqual(bufExpected, bufActual);
}

export function verifyTimestamp(timestamp: number): boolean {
  if (!timestamp) {
    return false;
  }

  const now = Date.now();
  const diff = Math.abs(now - timestamp);

  return diff <= TIMESTAMP_TOLERANCE;
}

export function generateSignature(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
}
