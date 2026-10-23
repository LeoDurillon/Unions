// Runs the groupings the user asked for, on the same run slots as the pipeline and the agent
// reviews: a ticket's in its own container, a pull request's in a throwaway one (`union-g<id>`).
import {
  claimGrouping,
  effortFor,
  failInterruptedGroupings,
  finishGrouping,
  modelFor,
  resolveAgent,
  sharedPrompt,
  toolsFor,
  type Db,
  type GroupingOutcome,
  type ReviewGrouping,
} from '@union/core';

import { runAgent, type AgentFn } from './agent';
import type { AgentReviewDeps } from './agent-review';
import { openTarget, type ReviewTarget } from './agent-review-target';
import { mustRunIn } from './container-exec';
import { removeRunContainers } from './janitor';
import { REPO_DIR, type TicketContainer } from './provision';
import { GROUPING_FORMAT, HUNK_INDEX, hunkIndex } from './review-grouping-format';
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

function groupingPrompt(db: Db, target: ReviewTarget, spec: string): string {
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_groups').prompt}

## The specification

${spec}

## The change

${target.about}

The change is checked out in the repository root, at HEAD. Read it with \`git diff ${target.base}...HEAD\` (one file at a time when it is large: \`git diff ${target.base}...HEAD -- <path>\`) and read any file you need. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

Its changed files:

${target.paths.map((path) => `- ${path}`).join('\n')}

Every hunk of the diff is listed, file by file, in \`${HUNK_INDEX}\`: read it, and name hunks by the line it gives them.

## Your answer

${GROUPING_FORMAT}`;
}

async function groupChange(
  deps: AgentReviewDeps,
  grouping: ReviewGrouping,
  signal: AbortSignal,
): Promise<GroupingOutcome> {
  const { db, runtime } = deps;
  const target = await openTarget(deps, grouping, groupingContainer(grouping.id));
  const files = target.paths.map((path) => ({ path, patch: target.patchOf(path) ?? '' }));
  const index = `${REPO_DIR}/${HUNK_INDEX}`;
  try {
    await mustRunIn(runtime, target.container, ['sh', '-c', `cat > ${index}`], {
      stdin: hunkIndex(files),
    });
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
  } finally {
    // A ticket's container stays: its workspace is left as the agent found it.
    await mustRunIn(runtime, target.container, ['rm', '-f', index]).catch(() => '');
    await target.close();
  }
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
