// Runs queued agent reviews of a ticket's change or a pull request, sharing the run slots with the
// pipeline.
import {
  agentReviewStack,
  claimAgentReview,
  effortFor,
  emitEvent,
  failInterruptedAgentReviews,
  finishAgentReview,
  modelFor,
  resolveAgent,
  sharedPrompt,
  specsSection,
  toolsFor,
  type AgentReview,
  type AgentReviewSpec,
  type AgentReviewOutcome,
  type Db,
} from '@union/core';

import { runAgent, type AgentFn } from './agent';
import { FINDINGS_FORMAT, parseFindings, toDrafts, type Findings } from './agent-review-findings';
import { openStackTarget, stackOutcome, stackReviewPrompt } from './agent-review-stack';
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

/** `specs` null: the review asked for none, the ticket's own text stands in for them. */
function agentReviewPrompt(db: Db, target: ReviewTarget, specs: AgentReviewSpec[] | null): string {
  const specText = specs === null ? '' : specsSection(specs);
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_comments').prompt}

## What you review

${specs === null ? target.about : target.brief}
${specText === '' ? '' : `\n${specText}\n`}
The change is checked out in the repository root, at HEAD. Compare it with its base with \`git diff ${target.base}...HEAD\` and \`git log ${target.base}..HEAD\`, and read any file you need. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

## Your answer

${FINDINGS_FORMAT}`;
}

/** A change checked out for the agent: where it runs, what it is asked, what its findings become. */
type Checkout = {
  container: string;
  prompt: string;
  log: (event: unknown) => void;
  close: () => Promise<void>;
  outcome: (findings: Findings) => AgentReviewOutcome;
};

/** One change (a ticket's or a pull request's), or the pull requests of a stack together. */
async function openCheckout(deps: AgentReviewDeps, review: AgentReview): Promise<Checkout> {
  const names = agentReviewContainer(review.id);
  const stack = agentReviewStack(deps.db, review.id);
  if (stack.length > 1) {
    const target = await openStackTarget(
      deps,
      stack.map((member) => member.reviewId),
      names,
    );
    return {
      container: target.container,
      prompt: stackReviewPrompt(deps.db, target, review.specs),
      log: () => {
        // A pull request review has no log view.
      },
      close: target.close,
      outcome: (findings) => stackOutcome(findings, target.members),
    };
  }
  const target = await openTarget(deps, review, names);
  return {
    container: target.container,
    prompt: agentReviewPrompt(deps.db, target, review.specs),
    log: target.log,
    close: target.close,
    outcome: (findings) => ({
      status: 'succeeded',
      headSha: target.headSha,
      drafts: toDrafts(findings, target.patchOf),
    }),
  };
}

/** The agent reads the change and its findings become drafts on the diffs the user reviews. */
async function reviewChange(
  deps: AgentReviewDeps,
  review: AgentReview,
  signal: AbortSignal,
): Promise<AgentReviewOutcome> {
  const { db, runtime } = deps;
  const checkout = await openCheckout(deps, review);
  try {
    if (signal.aborted) {
      return { status: 'cancelled' };
    }
    const outcome = await (deps.agent ?? runAgent)(runtime, {
      container: checkout.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_comments'),
      effort: effortFor(db, 'review_comments'),
      prompt: checkout.prompt,
      tools: toolsFor(db, 'review_comments'),
      signal,
      onEvent: checkout.log,
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
    return checkout.outcome(findings);
  } finally {
    await checkout.close();
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
