// @no-test-required: covered by tests/admin-templates-extra.test.ts and tests/admin-route-coverage.test.ts
/**
 * View-model builders for the interview report pages.
 *
 * The report pages render three shapes: the analysis section, the full
 * transcript and the Markdown download. Each builder returns the exact lines or
 * fields the template/destination expects, so the Markdown export and the HTML
 * page cannot drift apart.
 */

const SENTIMENT_LABELS: Record<string, string> = {
  positive: '积极',
  negative: '消极',
  neutral: '中性',
};

/** Header block of the Markdown report: who was interviewed, and the status. */
export function reportHeaderLines(
  interview: { userId: string; status: string },
  inviteeInfo: { name?: string; phone?: string }
): string[] {
  const lines = [`- **用户**: ${interview.userId}`];
  if (inviteeInfo.name) lines.push(`- **姓名**: ${inviteeInfo.name}`);
  if (inviteeInfo.phone) lines.push(`- **电话**: ${inviteeInfo.phone}`);
  lines.push(`- **状态**: ${interview.status}`, '', '---', '', '## 访谈对话记录', '');
  return lines;
}

/** The transcript, one labelled block per message. */
export function transcriptLines(messages: Array<{ role: string; content: string }>): string[] {
  const lines: string[] = [];
  for (const m of messages) {
    const roleLabel = m.role === 'assistant' ? '🤖 机器人' : '👤 受访者';
    lines.push(`**${roleLabel}**：`, '', m.content, '');
  }
  return lines;
}

/** The analysis section, omitted entirely when no report exists yet. */
export function analysisSectionLines(report: {
  content?: string | null;
  sentiment?: string | null;
  keyFindings?: string[] | null;
  recommendations?: string[] | null;
}): string[] {
  const lines = ['---', '', '## 访谈分析总结', '', report.content ?? '', ''];
  if (report.sentiment) {
    lines.push(`**情感分析**: ${SENTIMENT_LABELS[report.sentiment] ?? report.sentiment}`, '');
  }
  if (report.keyFindings?.length) {
    lines.push('**关键发现**：', '');
    for (const f of report.keyFindings) lines.push(`- ${f}`);
    lines.push('');
  }
  if (report.recommendations?.length) {
    lines.push('**建议**：', '');
    for (const r of report.recommendations) lines.push(`- ${r}`);
    lines.push('');
  }
  return lines;
}
