// The split's agent turns: its first try, then the host's problems sent back until the result passes.
import type { PlannedSlice } from '@union/core';

import type { AgentOutcome } from './agent';
import { continueTask, runInImplementerSession, type Rebase } from './rebase-agent';
import type { StepResult } from './scheduler';
import type { History } from './simplify-git';
import { fixTask, splitTask } from './split-agent';
import { verifySplit, type Verified } from './split-verify';

/** Rounds the agent gets to fix what the host refused, after its first try. */
const FIX_ROUNDS = 2;

type Ok = Extract<AgentOutcome, { kind: 'ok' }>;

function failed(outcome: Exclude<AgentOutcome, Ok>): StepResult {
  return outcome.kind === 'rate_limited'
    ? { kind: 'rate_limited', retryAt: null }
    : { kind: 'error', error: outcome.message };
}

/** The agent's split, sent back with the host's problems until it passes or the rounds run out. */
export async function splitUntilVerified(
  rebase: Rebase,
  input: { start: History; slices: readonly PlannedSlice[]; plan: string },
): Promise<{ outcome: Ok; verified: Extract<Verified, { ok: true }> } | StepResult> {
  const task = splitTask(rebase.deps.db, rebase, input);
  let outcome = await runInImplementerSession(rebase, task);
  for (let round = 0; ; round += 1) {
    if (outcome.kind !== 'ok') {
      return failed(outcome);
    }
    const verified = await verifySplit(rebase, { start: input.start, count: input.slices.length });
    if (verified.ok) {
      return { outcome, verified };
    }
    if (round === FIX_ROUNDS) {
      return {
        kind: 'error',
        error: `${verified.problems.join('\n\n')}\n\nThe agent's report:\n\n${outcome.text}`,
      };
    }
    outcome = await continueTask(rebase, fixTask(task, verified.problems), outcome.sessionId);
  }
}
