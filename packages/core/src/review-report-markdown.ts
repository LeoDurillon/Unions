// A spec report as markdown, for Copy as markdown on the review page. Pure, browser-safe.
import {
  REQUIREMENT_STATUSES,
  type ImportantFile,
  type ReportLines,
  type OutOfScopeChange,
  type ReportRequirement,
  type ReportSpec,
  type ReportVerdict,
  type RequirementStatus,
  type ReviewReportResult,
} from './review-report-types';

const VERDICT_LABELS: Record<ReportVerdict, string> = {
  matches: 'Matches the specs',
  partial: 'Partly matches the specs',
  diverges: 'Diverges from the specs',
};

const STATUS_LABELS: Record<RequirementStatus, string> = {
  done: 'Done',
  partial: 'Partial',
  missing: 'Missing',
  differs: 'Done differently',
  unclear: 'Unclear in the spec',
};

function place(path: string, range: ReportLines): string {
  return range.start === range.end
    ? `\`${path}:${range.start}\``
    : `\`${path}:${range.start}-${range.end}\``;
}

/** "6 done · 2 partial · 3 not in the spec": the statuses present, in a fixed order. */
export function reportCounts(result: ReviewReportResult): string {
  const counts = REQUIREMENT_STATUSES.map((status) => ({
    status,
    count: result.requirements.filter((r) => r.status === status).length,
  }))
    .filter(({ count }) => count > 0)
    .map(({ status, count }) => `${count} ${STATUS_LABELS[status].toLowerCase()}`);
  if (result.outOfScope.length > 0) {
    counts.push(`${result.outOfScope.length} not in the spec`);
  }
  return counts.join(' · ');
}

function importantFile(file: ImportantFile, position: number): string {
  const lines = file.lines.map((range) => place(file.path, range)).join(', ');
  const where = lines === '' ? `\`${file.path}\`` : lines;
  const unchanged = file.unchanged ? ' (not changed)' : '';
  return `${position + 1}. ${where}${unchanged}: ${file.why}`;
}

function requirement(item: ReportRequirement, specs: ReportSpec[]): string[] {
  const source = specs.find((spec) => spec.id === item.specId);
  const lines = [`### ${item.title}: ${STATUS_LABELS[item.status]}`, ''];
  if (item.spec !== null) {
    lines.push(`> ${item.spec.replaceAll('\n', '\n> ')}`);
    if (source) {
      lines.push(`> — ${source.label}`);
    }
    lines.push('');
  }
  const evidence = item.evidence.map((e) => place(e.path, e));
  if (evidence.length > 0) {
    lines.push(`Code: ${evidence.join(', ')}`);
  }
  const tests = item.tests.map((path) => `\`${path}\``);
  lines.push(`Tests: ${tests.length > 0 ? tests.join(', ') : 'none'}`);
  if (item.note !== '') {
    lines.push('', item.note);
  }
  return lines;
}

function outOfScope(change: OutOfScopeChange): string {
  return `- \`${change.path}\` (${change.risk} risk): ${change.reason}`;
}

/** A titled section of bullet lines, or nothing when it has none. */
function section(title: string, items: string[]): string[] {
  return items.length === 0 ? [] : [`## ${title}`, '', ...items, ''];
}

export function reportMarkdown(result: ReviewReportResult, specs: ReportSpec[]): string {
  return [
    `# ${VERDICT_LABELS[result.verdict]}`,
    '',
    result.summary,
    '',
    reportCounts(result),
    '',
    ...section('Important files', result.importantFiles.map(importantFile)),
    ...section(
      'Requirements',
      result.requirements.flatMap((item, i) => [
        ...(i > 0 ? [''] : []),
        ...requirement(item, specs),
      ]),
    ),
    ...section('Not in the spec', result.outOfScope.map(outOfScope)),
    ...section(
      'Risks',
      result.risks.map((r) => `- **${r.title}** (${r.severity}): ${r.detail}`),
    ),
    ...section(
      'Questions',
      result.questions.map((q) => `- ${q}`),
    ),
    ...section(
      'Docs to update',
      result.docs.map((d) => `- \`${d.path}\`: ${d.note}`),
    ),
  ]
    .join('\n')
    .trimEnd();
}
