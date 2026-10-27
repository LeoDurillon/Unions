// Runs the groupings the user asked for, on the same run slots as the pipeline and the agent
// reviews: a ticket's in its own container, a pull request's in a throwaway one (`union-g<id>`).
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

import { runAgent, type AgentFn } from './agent';
import type { AgentReviewDeps } from './agent-review';
import { openTarget } from './agent-review-target';
import { withHunkIndex } from './hunk-index-file';
import { removeRunContainers } from './janitor';
import { REPO_DIR, type TicketContainer } from './provision';
import { groupingPrompt } from './review-grouping-prompt';
import { parseGrouping } from './review-grouping-result';
import { RunPool } from './run-pool';

const ANSWER_TAIL_CHARS = 2000;

/** A pull request's grouping runs in its own throwaway container. */
function groupingContainer(id: number): TicketContainer {
  return {
    name: `union-g${id}`,
    homeVolume: `union-g${id}-home`,
    workspaceVolume: `union-g${id}-ws`,
  };
}

async function groupChange(
  deps: AgentReviewDeps,
  grouping: ReviewGrouping,
  signal: AbortSignal,
): Promise<GroupingOutcome> {
  const { db, runtime } = deps;
  const target = await openTarget(deps, grouping, groupingContainer(grouping.id));
  return withHunkIndex(runtime, target, async (files) => {
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_groups'),
      effort: effortFor(db, 'review_groups'),
      prompt: groupingPrompt(db, target, grouping.spec),
      tools: toolsFor(db, 'review_groups'),
      signal,
      onEvent: target.log,
    });
    if (outcome.kind !== 'ok') {
      const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
      return { status: 'failed', error: `${prefix}${outcome.message}` };
    }
    const result = parseGrouping(outcome.text, files);
    if (!result) {
      return {
        status: 'failed',
        error: `The agent's answer has no grouping block. Its end:\n\n${outcome.text.slice(-ANSWER_TAIL_CHARS)}`,
      };
    }
    return { status: 'succeeded', headSha: target.headSha, result };
  });
}

/**
 * Runs the groupings the user asked for, on the same run slots as the pipeline and the agent
 * reviews: a ticket's in its own container, a pull request's in a throwaway one (`union-g<id>`).
 */
export class ReviewGroupingRunner extends RunPool<ReviewGrouping, GroupingOutcome> {
  constructor(private readonly deps: AgentReviewDeps & { agent?: AgentFn }) {
    super({
      slots: deps.slots,
      claim: () => claimGrouping(deps.db),
      run: (grouping, signal) => groupChange(deps, grouping, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'cancelled' },
      finish: (grouping, outcome) => {
        finishGrouping(deps.db, grouping.id, outcome);
      },
    });
  }

  /** Fails the groupings a stopped worker left running and removes their pull request containers. */
  async recover(): Promise<void> {
    const left = failInterruptedGroupings(this.deps.db).filter((run) => run.reviewId !== null);
    const containers = left.map((run) => groupingContainer(run.id));
    await removeRunContainers(this.deps.db, this.deps.runtime, containers);
  }
}
