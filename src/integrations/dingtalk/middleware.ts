import crypto from 'node:crypto';

const TIMESTAMP_TOLERANCE = 300000;

export function verifySignature(timestamp: number, secret: string, signature: string): boolean {
  if (!timestamp || !secret || !signature) {
    return false;
  }

  if (!verifyTimestamp(timestamp)) {
    return false;
  }

  const stringToSign = `${timestamp}\n${secret}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('base64');

  return expectedSignature === signature;
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
