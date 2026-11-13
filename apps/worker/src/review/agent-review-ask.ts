// Runs one agent of an agent review, its lines logged under the review, and reads its findings.
// A one-pass review asks once; a sliced one asks the grouping, each slice and the seams in turn,
// all in the same checkout.

import {
  appendAgentLine,
  effortFor,
  modelFor,
  toolsFor,
  type AgentReview,
  type RunAgent,
} from '@union/core';

import { agentFailure, runAgent, type AgentOutcome } from '../agent/agent';
import { REPO_DIR } from '../provision';
import type { AgentReviewDeps } from './agent-review';
import { parseFindings } from './agent-review-findings';
import type { PartAnswer } from './agent-review-merge';
import { missingBlock } from './outcome-text';

/** Runs the `step` agent with `prompt` in the review's checkout, in a fresh session. */
export function askReviewAgent(
  deps: AgentReviewDeps,
  run: { row: AgentReview; container: string; signal: AbortSignal },
  step: Extract<RunAgent, 'review_comments' | 'review_groups'>,
  prompt: string,
): Promise<AgentOutcome> {
  const { db, runtime } = deps;
  const { row } = run;
  return (deps.agent ?? runAgent)(runtime, {
    container: run.container,
    cwd: REPO_DIR,
    model: modelFor(db, step),
    effort: effortFor(db, step),
    prompt,
    tools: toolsFor(db, step),
    signal: run.signal,
    // Kept by the review's id, a pull request's too; a ticket's lines are also its Log's.
    onEvent: (event) => {
      appendAgentLine(db, {
        agentReviewId: row.id,
        ticketId: row.ticketId ?? undefined,
        payload: event,
      });
    },
  });
}

/** What an agent answered: its findings, or why there are none. */
export function answerOf(title: string, outcome: AgentOutcome): PartAnswer {
  if (outcome.kind !== 'ok') {
    return { title, findings: null, error: agentFailure(outcome) };
  }
  const findings = parseFindings(outcome.text);
  return findings
    ? { title, findings, error: null }
    : { title, findings: null, error: missingBlock('comments', outcome.text) };
}
