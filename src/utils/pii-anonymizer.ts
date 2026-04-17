const PHONE_RE = /\b1[3-9]\d{9}\b/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CHINESE_NAME_RE = /[\u4e00-\u9fa5]{2,4}(?:说|的|表示|反映|提到|认为|反馈|也同意)/g;

export function anonymizePII(text: string): string {
  if (!text) return '';
  let result = text;
  result = result.replace(PHONE_RE, (m) => `${m.slice(0, 3)}****${m.slice(7)}`);
  result = result.replace(EMAIL_RE, '[邮箱]');
  result = result.replace(CHINESE_NAME_RE, '[匿名用户]');
  return result;
}
