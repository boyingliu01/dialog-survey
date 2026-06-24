import type { DingTalkClient } from '../integrations/dingtalk/client.js';

/**
 * Normalize a phone number: strip all non-digit characters,
 * strip +86 country code prefix if present.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('86') && digits.length === 13 ? digits.slice(2) : digits;
}

export interface PhoneVerificationResult {
  /** Whether the phone was resolved and the name verified (or no name to verify) */
  verified: boolean;
  /** Resolved DingTalk userId (only set when phone lookup succeeded) */
  userId?: string;
  /** The authenticated name from DingTalk (or empty if not available) */
  name: string;
  /** Human-readable reason when verified=false */
  reason?: string;
}

/**
 * Verify that a phone number belongs to the expected person by comparing
 * the provided name against DingTalk's registered name.
 *
 * This is the single shared verification function that all data entry
 * points should call when accepting phone + name input.
 *
 * Behavior:
 * - Resolves phone via DingTalk API `getUserIdByMobile()`
 * - If phone not found or API fails → returns `{ verified: false, reason: "..." }`
 * - If no name was provided → returns `{ verified: true, name: <DingTalk name> }` (trust DingTalk)
 * - If DingTalk returns empty name → returns `{ verified: true }` (cannot verify)
 * - If provided name matches DingTalk name (trimmed) → `{ verified: true }`
 * - If names differ → `{ verified: false, reason: "name mismatch", name: <DingTalk name> }`
 */
export async function verifyPhoneToName(
  client: DingTalkClient,
  phone: string,
  providedName?: string
): Promise<PhoneVerificationResult> {
  const normalizedPhone = normalizePhone(phone);

  let lookupResult: Awaited<ReturnType<DingTalkClient['getUserIdByMobile']>>;
  try {
    lookupResult = await client.getUserIdByMobile(normalizedPhone);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      verified: false,
      reason: `DingTalk service unavailable: ${errorMsg}`,
      name: '',
    };
  }

  if (!lookupResult.found) {
    return {
      verified: false,
      reason: 'Phone number not found in DingTalk',
      name: '',
    };
  }

  const dtName = lookupResult.name.trim();
  const inputName = providedName?.trim();

  // If caller didn't provide a name, trust DingTalk's name
  if (!inputName) {
    return {
      verified: true,
      userId: lookupResult.userId,
      name: dtName,
    };
  }

  // If DingTalk didn't return a name, we can't verify
  if (!dtName) {
    return {
      verified: true,
      userId: lookupResult.userId,
      name: inputName,
    };
  }

  // Strict comparison after trimming
  if (inputName === dtName) {
    return {
      verified: true,
      userId: lookupResult.userId,
      name: dtName,
    };
  }

  // Name mismatch
  return {
    verified: false,
    userId: lookupResult.userId,
    name: dtName,
    reason: `Name mismatch: provided "${inputName}" but DingTalk registered name is "${dtName}"`,
  };
}
