// Groups a review's files by spec, as the user asked: a ticket's in its own container, a pull request's in a throwaway one (`union-g<id>`).
import {
  claimGrouping,
  effortFor,
  failInterruptedGroupings,
  finishGrouping,
  modelFor,
  toolsFor,
  type GroupingOutcome,
  type ReviewGrouping,
} from '@union/core';

import { agentFailure, runAgent } from './agent';
import type { AgentReviewDeps } from './agent-review';
import { openTarget } from './agent-review-target';
import { REPO_DIR } from './provision';
import { groupingPrompt } from './review-grouping-prompt';
import { parseGrouping } from './review-grouping-result';
import { SideReviewRunner, STANDARD_ENDS, type SideReviewKind } from './side-review/engine';
import { missingBlock } from './side-review/outcome-text';

const grouping: SideReviewKind<ReviewGrouping, GroupingOutcome> = {
  kind: 'grouping',
  letter: 'g',
  claim: ({ db }) => claimGrouping(db),
  finish: ({ db }, row, outcome) => {
    finishGrouping(db, row.id, outcome);
  },
  failInterrupted: ({ db }) => failInterruptedGroupings(db),
  open: openTarget,
  ...STANDARD_ENDS,
  work: async (deps, { row, target, files, signal }) => {
    const { db, runtime } = deps;
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_groups'),
      effort: effortFor(db, 'review_groups'),
      prompt: groupingPrompt(db, target, row.spec),
      tools: toolsFor(db, 'review_groups'),
      signal,
      onEvent: target.log,
    });
    if (outcome.kind !== 'ok') {
      return { status: 'failed', error: agentFailure(outcome) };
    }
    const result = parseGrouping(outcome.text, files);
    return result
      ? { status: 'succeeded', headSha: target.headSha, result }
      : { status: 'failed', error: missingBlock('grouping', outcome.text) };
  },
};

/** Runs the groupings the user asked for, on the run slots the pipeline shares. */
export class ReviewGroupingRunner extends SideReviewRunner<ReviewGrouping, GroupingOutcome> {
  constructor(deps: AgentReviewDeps) {
    super(deps, grouping);
  }
}
