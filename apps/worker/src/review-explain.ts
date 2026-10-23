// Runs the explanations of a review's lines on the shared run slots, a pull request's in a throwaway container.
import {
  appendAgentLine,
  claimExplanation,
  explanationOwner,
  explanationSpecParts,
  explanationThread,
  failInterruptedExplanations,
  finishExplanation,
  latestGrouping,
  modelFor,
  effortFor,
  toolsFor,
  type Db,
  type ExplanationOutcome,
  type ReviewExplanation,
  type SpecPart,
} from '@union/core';

import { runAgent, runResumable, type AgentFn, type AgentOutcome } from './agent';
import type { AgentReviewDeps } from './agent-review';
import { openTarget, type ReviewTarget } from './agent-review-target';
import { runIn } from './container-exec';
import { removeRunContainers } from './janitor';
import { REPO_DIR, type TicketContainer } from './provision';
import { explainPrompt, followUpPrompt } from './review-explain-prompt';
import { keepDocs, parseExplanation } from './review-explain-result';
import { RunPool } from './run-pool';

const ANSWER_TAIL_CHARS = 2000;
/** Prints back each path read on stdin that exists in the checkout. */
const EXISTING = String.raw`while IFS= read -r p; do [ -e "$p" ] && printf "%s\n" "$p"; done; true`;

/** A pull request's explanation runs in its own throwaway container. */
function explanationContainer(id: number): TicketContainer {
  return {
    name: `union-e${id}`,
    homeVolume: `union-e${id}-home`,
    workspaceVolume: `union-e${id}-ws`,
  };
}

/** The parts of the review's newest grouping the lines touch (an outdated one still counts). */
function specParts(db: Db, target: ReviewTarget, explanation: ReviewExplanation): SpecPart[] {
  const grouping = latestGrouping(db, explanationOwner(explanation));
  const patch = target.patchOf(explanation.path);
  if (grouping?.status !== 'succeeded' || !grouping.result || patch === undefined) {
    return [];
  }
  const { side, startLine: start, endLine: end } = explanation;
  return explanationSpecParts(
    grouping.result,
    { path: explanation.path, patch },
    { side, start, end },
  );
}

async function existing(
  deps: AgentReviewDeps,
  container: string,
  paths: string[],
): Promise<Set<string>> {
  if (paths.length === 0) {
    return new Set();
  }
  const out = await runIn(deps.runtime, container, ['sh', '-c', EXISTING], {
    cwd: REPO_DIR,
    stdin: `${paths.join('\n')}\n`,
  });
  return new Set(out.stdout.split('\n').filter((line) => line !== ''));
}

/** A ticket's follow-up resumes the session of the answer it follows; a pull request's has none left. */
function ask(
  deps: AgentReviewDeps,
  target: ReviewTarget,
  thread: ReviewExplanation[],
  run: Parameters<AgentFn>[1],
): Promise<AgentOutcome> {
  const agent = deps.agent ?? runAgent;
  const explanation = thread.at(-1);
  const session = thread.slice(0, -1).at(-1)?.sessionId ?? null;
  if (!explanation || session === null || explanation.ticketId === null) {
    return agent(deps.runtime, run);
  }
  const resumed = { ...run, resumeSessionId: session, prompt: followUpPrompt(explanation) };
  return runResumable(agent, deps.runtime, resumed, run.prompt);
}

async function explain(
  deps: AgentReviewDeps,
  explanation: ReviewExplanation,
  signal: AbortSignal,
): Promise<ExplanationOutcome> {
  const { db } = deps;
  const target = await openTarget(deps, explanation, explanationContainer(explanation.id));
  try {
    const thread = explanationThread(db, explanation);
    const outcome = await ask(deps, target, thread, {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_explain'),
      effort: effortFor(db, 'review_explain'),
      prompt: explainPrompt(db, target, thread, specParts(db, target, explanation)),
      tools: toolsFor(db, 'review_explain'),
      signal,
      // A ticket's lines are its own too, so its usage counts them, as for its agent reviews.
      onEvent: (event) => {
        appendAgentLine(db, {
          explanationId: explanation.id,
          ticketId: explanation.ticketId ?? undefined,
          payload: event,
        });
      },
    });
    if (outcome.kind !== 'ok') {
      const prefix = outcome.kind === 'rate_limited' ? 'Usage limit reached: ' : '';
      return { status: 'failed', error: `${prefix}${outcome.message}` };
    }
    const parsed = parseExplanation(outcome.text, explanation.specs);
    if (!parsed) {
      return {
        status: 'failed',
        error: `The agent's answer has no explanation block. Its end:\n\n${outcome.text.slice(-ANSWER_TAIL_CHARS)}`,
      };
    }
    const found = await existing(
      deps,
      target.container,
      parsed.docs.map((doc) => doc.path),
    );
    return { status: 'succeeded', result: keepDocs(parsed, found), sessionId: outcome.sessionId };
  } finally {
    await target.close();
  }
}

/**
 * Runs the explanations users asked for, one per review at a time, on the same run slots as the
 * pipeline: a ticket's in its own container, a pull request's in a throwaway one (`union-e<id>`).
 */
export class ReviewExplainRunner extends RunPool<ReviewExplanation, ExplanationOutcome> {
  constructor(private readonly deps: AgentReviewDeps & { agent?: AgentFn }) {
    super({
      slots: deps.slots,
      claim: () => claimExplanation(deps.db),
      run: (explanation, signal) => explain(deps, explanation, signal),
      failed: (error) => ({ status: 'failed', error }),
      stopped: { status: 'cancelled' },
      finish: (explanation, outcome) => {
        finishExplanation(deps.db, explanation.id, outcome);
      },
    });
  }

  /** Fails the explanations a stopped worker left running and removes their pull request containers. */
  async recover(): Promise<void> {
    const left = failInterruptedExplanations(this.deps.db).filter((run) => run.reviewId !== null);
    const containers = left.map((run) => explanationContainer(run.id));
    await removeRunContainers(this.deps.db, this.deps.runtime, containers);
  }
}
