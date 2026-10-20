import type { DingTalkClient } from '../integrations/dingtalk/client.js';
import { warn } from '../utils/logger.js';
import { maskPhone } from '../utils/pii-anonymizer.js';

/**
 * Normalize a phone number: strip all non-digit characters,
 * strip +86 country code prefix if present.
 */
export function normalizePhone(phone: string): string {
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
  /** Machine-readable failure class, so callers can react without parsing `reason` */
  failure?: PhoneVerificationFailure;
}

/**
 * Why a verification failed. Distinguishing these matters: before this existed,
 * missing credentials, insufficient permission and a network outage all
 * surfaced as one indistinguishable "service unavailable" message (issue #198).
 */
export type PhoneVerificationFailure =
  | 'credential_missing'
  | 'permission_denied'
  | 'network_error'
  | 'name_unverifiable'
  | 'phone_not_found'
  | 'name_mismatch';

/** Map a DingTalk error message onto a failure class. */
function classifyLookupError(err: unknown): PhoneVerificationFailure {
  const message = err instanceof Error ? err.message : String(err);

  // Errconsumer 40035 ("缺少参数 corpid or appkey") means the credentials never
  // reached the request — a configuration problem, not an outage.
  if (/errcode:?\s*40035|缺少参数.*appkey|corpid or appkey/i.test(message)) {
    return 'credential_missing';
  }
  // 60011 / errcode 88: the app is registered but lacks the contact scope.
  if (/60011|requiredScopes|permission|权限/i.test(message)) {
    return 'permission_denied';
  }
  if (/ECONN|ENOTFOUND|ETIMEDOUT|fetch failed|network|socket/i.test(message)) {
    return 'network_error';
  }
  return 'network_error';
}

/** Operator-facing wording per failure class; the detailed cause goes to the log. */
const FAILURE_REASON: Record<PhoneVerificationFailure, string> = {
  credential_missing:
    '钉钉应用凭据未配置或无效，请检查 DINGTALK_APP_KEY/SECRET 或 CLIENT_ID/SECRET',
  permission_denied:
    '钉钉应用缺少通讯录权限（qyapi_get_member_by_mobile / qyapi_get_member），请联系管理员开通',
  network_error: '钉钉服务暂时不可用，请稍后重试',
  name_unverifiable: '钉钉未返回该手机号对应的姓名，无法校验姓名一致性，请检查通讯录权限后重试',
  phone_not_found: '该手机号未在钉钉通讯录中注册',
  name_mismatch: '输入的姓名与钉钉注册的姓名不一致',
};

/**
 * Verify that a phone number belongs to the expected person by comparing
 * the provided name against DingTalk's registered name.
 *
 * This is the single shared verification function that all data entry
 * points should call when accepting phone + name input.
 *
 * Behavior:
 * - Resolves phone via DingTalk API `getUserIdByMobile()`
 * - If phone not found or API fails → `{ verified: false, failure, reason }`, and
 *   the underlying cause is logged with the phone masked
 * - If no name was provided → `{ verified: true, name: <DingTalk name> }` (trust DingTalk)
 * - If DingTalk returns no name → `{ verified: false, failure: 'name_unverifiable' }`,
 *   because an unverifiable name must not silently pass
 * - If provided name matches DingTalk name (trimmed) → `{ verified: true }`
 * - If names differ → `{ verified: false, failure: 'name_mismatch', name: <DingTalk name> }`
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
    const failure = classifyLookupError(err);
    // The phone is PII: log the masked form plus the underlying cause, which is
    // what an operator actually needs to tell a config error from an outage.
    warn('DingTalk phone lookup failed', {
      phone: maskPhone(normalizedPhone),
      failure,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      verified: false,
      reason: FAILURE_REASON[failure],
      failure,
      name: '',
    };
  }

  if (!lookupResult.found) {
    return {
      verified: false,
      reason: FAILURE_REASON.phone_not_found,
      failure: 'phone_not_found',
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

  // The name is authoritative only if DingTalk actually returned one. A missing
  // name means the lookup could not confirm the person, so the mismatch check
  // must not be skipped — that is exactly how the comparison became a no-op
  // before `/topapi/v2/user/getbymobile` started resolving names (issue #199).
  if (!dtName) {
    return {
      verified: false,
      userId: lookupResult.userId,
      name: inputName,
      reason: FAILURE_REASON.name_unverifiable,
      failure: 'name_unverifiable',
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
    reason: `输入的姓名与钉钉注册的姓名（${dtName}）不一致`,
    failure: 'name_mismatch',
  };
}
