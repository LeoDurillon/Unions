// Reads the report block at the end of the agent's answer: quotes checked against the specs sent,
// paths against the change, the gaps always among what needs the reviewer, the changed files it says
// nothing about listed; what it cannot back is dropped and counted.
import {
  REPORT_VERDICTS,
  type ReportRequirement,
  type ReportSpec,
  type ReportVerdict,
  type ReviewReportResult,
} from '@union/core';

import { lastJsonBlock } from './json-block';
import { oneOf, text, texts } from './review-report-fields';
import { docsOf, importantFilesOf, requirementsOf, risksOf } from './review-report-items';
import { outOfScopeOf } from './review-report-scope';
import { attentionOf, skimOf, withGaps } from './review-report-triage';

/**
 * The agent's verdict, but never `matches` while a requirement is not done; when it gave none, the
 * one the requirements give.
 */
function verdictOf(said: ReportVerdict | null, requirements: ReportRequirement[]): ReportVerdict {
  const allDone = requirements.every((item) => item.status === 'done');
  if (said !== null) {
    return said === 'matches' && !allDone ? 'partial' : said;
  }
  if (requirements.some((item) => item.status === 'differs')) {
    return 'diverges';
  }
  return allDone ? 'matches' : 'partial';
}

/** The changed files the report says nothing about: in no requirement, list or item. */
function unreviewedOf(result: Omit<ReviewReportResult, 'unreviewed'>, changed: string[]): string[] {
  const placed = new Set([
    ...result.requirements.flatMap((item) => [...item.evidence.map((e) => e.path), ...item.tests]),
    ...result.attention.flatMap((item) => item.cites.map((cite) => cite.path)),
    ...result.importantFiles.map((file) => file.path),
    ...result.skim.map((file) => file.path),
    ...result.outOfScope.map((change) => change.path),
  ]);
  return changed.filter((path) => !placed.has(path));
}

/**
 * The agent's report, checked against the specs sent and the change (`files`, the diff's patches);
 * paths outside the change are only checked for shape here (`keepInCheckout` checks they exist).
 * Null when the answer has no report block.
 */
export function parseReport(
  answer: string,
  specs: ReportSpec[],
  files: { path: string; patch: string }[],
): ReviewReportResult | null {
  const block = lastJsonBlock(answer, (candidate) => Array.isArray(candidate.requirements));
  if (!block) {
    return null;
  }
  const requirements = requirementsOf(block.requirements, specs);
  const changed = new Set(files.map((file) => file.path));
  const importantFiles = importantFilesOf(block.importantFiles, changed, requirements.keys);
  const attention = attentionOf(block.attention, requirements.keys);
  const read = new Set([
    ...importantFiles.items.map((file) => file.path),
    ...attention.items.flatMap((item) => item.cites.map((cite) => cite.path)),
  ]);
  const skim = skimOf(block.skim, changed, read);
  const outOfScope = outOfScopeOf(block.outOfScope, files);
  const risks = risksOf(block.risks);
  const docs = docsOf(block.docs);
  const result = {
    verdict: verdictOf(oneOf(REPORT_VERDICTS, block.verdict), requirements.items),
    summary: text(block.summary),
    attention: withGaps(attention.items, requirements.items),
    importantFiles: importantFiles.items,
    skim: skim.items,
    requirements: requirements.items,
    outOfScope: outOfScope.items,
    risks: risks.items,
    questions: texts(block.questions),
    docs: docs.items,
    dropped: [requirements, importantFiles, attention, skim, outOfScope, risks, docs].reduce(
      (sum, parsed) => sum + parsed.dropped,
      0,
    ),
  };
  return { ...result, unreviewed: unreviewedOf(result, [...changed]) };
}
