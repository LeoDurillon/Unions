import {
  claimAgentReview,
  effortFor,
  emitEvent,
  failInterruptedAgentReviews,
  finishAgentReview,
  modelFor,
  resolveAgent,
  sharedPrompt,
  toolsFor,
  type AgentReview,
  type AgentReviewOutcome,
  type Db,
} from '@union/core';

import { runAgent, type AgentFn } from './agent';
import { FINDINGS_FORMAT, parseFindings, toDrafts } from './agent-review-findings';
import {
  agentReviewContainer,
  openTarget,
  type ReviewTarget,
  type TargetDeps,
} from './agent-review-target';
import { REPO_DIR } from './provision';
import type { RunSlots } from './slots';

const ANSWER_TAIL_CHARS = 2000;

export type AgentReviewDeps = TargetDeps & { slots: RunSlots; agent?: AgentFn };

export function agentReviewPrompt(db: Db, target: ReviewTarget): string {
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_comments').prompt}

## What you review

${target.about}

The change is checked out in the repository root, at HEAD. Compare it with its base with \`git diff ${target.base}...HEAD\` and \`git log ${target.base}..HEAD\`, and read any file you need. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

## Your answer

${FINDINGS_FORMAT}`;
}

/** The agent reads the change and its findings become drafts on the diff the user reviews. */
async function reviewChange(
  deps: AgentReviewDeps,
  review: AgentReview,
  signal: AbortSignal,
): Promise<AgentReviewOutcome> {
  const { db, runtime } = deps;
  const target = await openTarget(deps, review);
  try {
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_comments'),
      effort: effortFor(db, 'review_comments'),
      prompt: agentReviewPrompt(db, target),
      tools: toolsFor(db, 'review_comments'),
      signal,
      onEvent: target.log,
    });
    if (outcome.kind !== 'ok') {
      const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
      return { status: 'failed', error: `${prefix}${outcome.message}` };
    }
    const findings = parseFindings(outcome.text);
    if (!findings) {
      return {
        status: 'failed',
        error: `The agent's answer has no comments block. Its end:\n\n${outcome.text.slice(-ANSWER_TAIL_CHARS)}`,
      };
    }
    return {
      status: 'succeeded',
      headSha: target.headSha,
      drafts: toDrafts(findings, target.patchOf),
    };
  } finally {
    await target.close();
  }
}

/**
 * Runs queued agent reviews, sharing the run slots with the ticket pipeline and the investigations:
 * a ticket's in its own container, a pull request's in a throwaway one (`union-a<id>`).
 */
export class AgentReviewRunner {
  private readonly active = new Map<number, { abort: AbortController; done: Promise<void> }>();

  constructor(private readonly deps: AgentReviewDeps) {}

  /** Fails the reviews a stopped worker left running and removes their pull request containers. */
  async recover(): Promise<void> {
    for (const review of failInterruptedAgentReviews(this.deps.db)) {
      if (review.reviewId !== null) {
        const names = agentReviewContainer(review.id);
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
      const review = claimAgentReview(this.deps.db);
      if (!review) {
        this.deps.slots.release();
        return;
      }
      const abort = new AbortController();
      this.active.set(review.id, { abort, done: this.runTracked(review, abort.signal) });
    }
  }

  /** Stops a running review; it then finishes as cancelled. */
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

  private async runTracked(review: AgentReview, signal: AbortSignal): Promise<void> {
    try {
      const outcome = await reviewChange(this.deps, review, signal).catch(
        (error: unknown): AgentReviewOutcome => ({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      finishAgentReview(
        this.deps.db,
        review.id,
        signal.aborted ? { status: 'cancelled' } : outcome,
      );
    } finally {
      this.active.delete(review.id);
      this.deps.slots.release();
    }
  }
}
