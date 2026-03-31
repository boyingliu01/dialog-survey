/**
 * Cleans JSON markdown by removing ```json and ``` wrappers
 * @param text - Text possibly containing JSON markdown
 * @returns Cleaned JSON string
 */
export function cleanJsonMarkdown(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/, "")
    .replace(/\s*```$/, "");
}

/**
 * Safely parses JSON without schema validation
 * @param text - JSON string to parse
 * @returns Parsed object, or null if parsing fails
 */
export function safeJsonParse<T = unknown>(text: string): T | null;

/**
 * Safely parses JSON with type assertion
 * @param text - JSON string to parse
 * @param reviver - Optional reviver function
 * @returns Parsed object, or null if parsing fails
 */
export function safeJsonParse<T = unknown>(
  text: string,
  reviver?: (this: unknown, key: string, value: unknown) => unknown
): T | null;

export function safeJsonParse<T = unknown>(
  text: string,
  reviver?: (this: unknown, key: string, value: unknown) => unknown
): T | null {
  try {
    const cleanedText = cleanJsonMarkdown(text);
    return JSON.parse(cleanedText, reviver) as T;
  } catch {
    return null;
  }
}

/**
 * Safely stringifies JSON with pretty-printing
 * @param value - Value to stringify
 * @param space - Number of spaces for indentation
 * @returns JSON string, or "{}" if stringification fails
 */
export function safeJsonStringify(value: unknown, space = 2): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return "{}";
  }
}
