// The grouping agent's prompt: the specification, the change and the answer's format.
import { resolveAgent, sharedPrompt, type Db } from '@union/core';

import type { ReviewTarget } from './agent-review-target';
import { checkedOutChange } from './review-change-prompt';
import { GROUPING_FORMAT } from './review-grouping-format';

export function groupingPrompt(db: Db, target: ReviewTarget, spec: string): string {
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_groups').prompt}

## The specification

${spec}

## The change

${checkedOutChange(target)}

## Your answer

${GROUPING_FORMAT}`;
}
