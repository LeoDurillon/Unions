// Runs the groupings the user asked for, on the same run slots as the pipeline and the agent
// reviews: a ticket's in its own container, a pull request's in a throwaway one (`union-g<id>`).
import {
  claimGrouping,
  effortFor,
  emitEvent,
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
import { REPO_DIR, type TicketContainer } from './provision';
import { GROUPING_FORMAT, HUNK_INDEX, hunkIndex } from './review-grouping-format';
import { parseGrouping } from './review-grouping-result';

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
export class ReviewGroupingRunner {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly deps: AgentReviewDeps & { agent?: AgentFn }) {}

  /** Fails the groupings a stopped worker left running and removes their pull request containers. */
  async recover(): Promise<void> {
    for (const grouping of failInterruptedGroupings(this.deps.db)) {
      if (grouping.reviewId !== null) {
        const names = groupingContainer(grouping.id);
        await this.deps.runtime
          .remove(names.name, { home: names.homeVolume, workspace: names.workspaceVolume })
          .catch((error: unknown) => {
            emitEvent(this.deps.db, {
              type: 'container_cleanup_failed',
              payload: { container: names.name, error: String(error) },
            });
          });
      }
    }
  }

  tick(): void {
    while (this.deps.slots.tryTake()) {
      const grouping = claimGrouping(this.deps.db);
      if (!grouping) {
        this.deps.slots.release();
        return;
      }
      const abort = new AbortController();
      this.active.set(grouping.id, { abort, done: this.runTracked(grouping, abort.signal) });
    }
  }

  /** Stops a running grouping; it then finishes as cancelled. */
  cancel(id: number): void {
    this.active.get(id)?.abort.abort();
  }

  stop(): void {
    for (const { abort } of this.active.values()) {
      abort.abort();
    }
  }

  async idle(): Promise<void> {
    await Promise.all([...this.active.values()].map((run) => run.done));
  }

  private async runTracked(grouping: ReviewGrouping, signal: AbortSignal): Promise<void> {
    try {
      const outcome = await groupChange(this.deps, grouping, signal).catch(
        (error: unknown): GroupingOutcome => ({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      finishGrouping(this.deps.db, grouping.id, signal.aborted ? { status: 'cancelled' } : outcome);
    } finally {
      this.active.delete(grouping.id);
      this.deps.slots.release();
    }
  }
}
