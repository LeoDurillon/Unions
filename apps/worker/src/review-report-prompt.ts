// The prompts of a spec report: the first one with the specs and the change, and the one more turn
// asking for the block when the answer has none.
import { resolveAgent, sharedPrompt, type Db, type ReportSpec } from '@union/core';

import type { ReviewTarget } from './agent-review-target';
import { checkedOutChange } from './review-change-prompt';
import { REPORT_FORMAT, specSections } from './review-report-format';

export function reportPrompt(db: Db, target: ReviewTarget, specs: ReportSpec[]): string {
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_report').prompt}

## The specifications

${specSections(specs)}

## The change

${checkedOutChange(target)}

## Your answer

${REPORT_FORMAT}`;
}

/** One more turn in the same session when the answer has no report block. */
export const REPORT_AGAIN = `The host cannot read your report: your answer does not end with a \`json\` block holding \`requirements\`. Output that block again, in the format asked, and nothing else.`;
