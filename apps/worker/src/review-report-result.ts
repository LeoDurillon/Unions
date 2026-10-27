// Reads the report block at the end of the agent's answer: quotes checked against the specs sent,
// paths against the change, every changed file placed; what it cannot back is dropped and counted.
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

/** The verdict the requirements give, when the agent's cannot be read. */
function verdictOf(requirements: ReportRequirement[]): ReportVerdict {
  if (requirements.some((item) => item.status === 'differs')) {
    return 'diverges';
  }
  return requirements.every((item) => item.status === 'done') ? 'matches' : 'partial';
}

/** The changed files a requirement shows as its code or its tests. */
function placedBy(requirements: ReportRequirement[]): Set<string> {
  return new Set(
    requirements.flatMap((item) => [...item.evidence.map((e) => e.path), ...item.tests]),
  );
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
  const outOfScope = outOfScopeOf(block.outOfScope, files, placedBy(requirements.items));
  const risks = risksOf(block.risks);
  const docs = docsOf(block.docs);
  return {
    verdict: oneOf(REPORT_VERDICTS, block.verdict) ?? verdictOf(requirements.items),
    summary: text(block.summary),
    importantFiles: importantFiles.items,
    requirements: requirements.items,
    outOfScope: outOfScope.items,
    risks: risks.items,
    questions: texts(block.questions),
    docs: docs.items,
    dropped:
      requirements.dropped +
      importantFiles.dropped +
      outOfScope.dropped +
      risks.dropped +
      docs.dropped,
  };
}
