// Answers the turns of a review's Explain conversations, one per review at a time. A ticket's runs in
// its own container, a pull request's in a throwaway one (`union-e<id>`).

import {
  appendAgentLine,
  claimExplanation,
  explanationOwner,
  explanationThread,
  failInterruptedExplanations,
  finishExplanation,
  latestGrouping,
  modelFor,
  effortFor,
  toolsFor,
  turnSpecParts,
  type Db,
  type ExplanationOutcome,
  type ReviewExplanation,
  type SpecPart,
} from '@union/core';

import {
  agentFailure,
  runAgent,
  runResumable,
  type AgentFn,
  type AgentOutcome,
} from '../agent/agent';
import { runIn } from '../container-exec';
import { REPO_DIR } from '../provision';
import type { AgentReviewDeps } from './agent-review';
import { openTarget, type ReviewTarget } from './agent-review-target';
import { SideReviewRunner, STANDARD_ENDS, type SideReviewKind } from './engine';
import { missingBlock } from './outcome-text';
import { explainPrompt, followUpPrompt, lastTurns, resumedSession } from './review-explain-prompt';
import { keepDocs, parseExplanation } from './review-explain-result';

/** Prints back each path read on stdin that exists in the checkout. */
const EXISTING = String.raw`while IFS= read -r p; do [ -e "$p" ] && printf "%s\n" "$p"; done; true`;

/** The parts of the review's newest grouping the turn's lines touch (an outdated one still counts). */
function specParts(db: Db, target: ReviewTarget, explanation: ReviewExplanation): SpecPart[] {
  const grouping = latestGrouping(db, explanationOwner(explanation));
  if (grouping?.status !== 'succeeded' || !grouping.result) {
    return [];
  }
  return turnSpecParts(grouping.result, explanation.subjects, target.patchOf);
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

/** A turn resumes its conversation's session when it can (`resumedSession`), else runs fresh. */
function ask(
  deps: AgentReviewDeps,
  target: ReviewTarget,
  thread: ReviewExplanation[],
  run: Parameters<AgentFn>[1] & { parts: SpecPart[] },
): Promise<AgentOutcome> {
  const agent = deps.agent ?? runAgent;
  const { parts, ...fresh } = run;
  const { turn, before } = lastTurns(thread);
  const session = resumedSession(thread);
  if (!turn || !before || session === null) {
    return agent(deps.runtime, fresh);
  }
  const prompt = followUpPrompt(target, turn, before, parts);
  const resumed = { ...fresh, resumeSessionId: session, prompt };
  return runResumable(agent, deps.runtime, resumed, fresh.prompt);
}

const explanation: SideReviewKind<ReviewExplanation, ExplanationOutcome> = {
  kind: 'explanation',
  letter: 'e',
  claim: ({ db }) => claimExplanation(db),
  finish: ({ db }, row, outcome) => {
    finishExplanation(db, row.id, outcome);
  },
  failInterrupted: ({ db }) => failInterruptedExplanations(db),
  open: openTarget,
  ...STANDARD_ENDS,
  hunkIndex: false,
  work: async (deps, { row, target, signal }) => {
    const { db } = deps;
    const thread = explanationThread(db, row);
    const parts = specParts(db, target, row);
    const outcome = await ask(deps, target, thread, {
      container: target.container,
      cwd: REPO_DIR,
      model: modelFor(db, 'review_explain'),
      effort: effortFor(db, 'review_explain'),
      prompt: explainPrompt(db, target, thread, parts),
      parts,
      tools: toolsFor(db, 'review_explain'),
      signal,
      // A ticket's lines are its own too, so its usage counts them, as for its agent reviews.
      onEvent: (event) => {
        appendAgentLine(db, {
          explanationId: row.id,
          ticketId: row.ticketId ?? undefined,
          payload: event,
        });
      },
    });
    if (outcome.kind !== 'ok') {
      return { status: 'failed', error: agentFailure(outcome) };
    }
    const parsed = parseExplanation(outcome.text, row.specs);
    if (!parsed) {
      return { status: 'failed', error: missingBlock('explanation', outcome.text) };
    }
    const docs = parsed.docs.map((doc) => doc.path);
    const found = await existing(deps, target.container, docs);
    return { status: 'succeeded', result: keepDocs(parsed, found), sessionId: outcome.sessionId };
  },
};

/** Runs the explanations users asked for, one per review at a time, on the run slots the pipeline shares. */
export class ReviewExplainRunner extends SideReviewRunner<ReviewExplanation, ExplanationOutcome> {
  constructor(deps: AgentReviewDeps) {
    super(deps, explanation);
  }
}
