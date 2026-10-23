// The agent's turns at rewriting a stack: its first try, then the host's problems sent back until the result passes.
import type { PlannedSlice } from '@union/core';

import type { AgentOutcome } from './agent';
import {
  continueTask,
  runInImplementerSession,
  type Rebase,
  type SessionTask,
} from './rebase-agent';
import type { StepResult } from './scheduler';
import type { History } from './simplify-git';
import { fixTask, splitTask } from './split-agent';
import { verifySplit, type Verified } from './split-verify';

/** Rounds the agent gets to fix what the host refused, after its first try. */
const FIX_ROUNDS = 2;

type Ok = Extract<AgentOutcome, { kind: 'ok' }>;
type Refused = { ok: false; problems: string[] };

/** A rewrite the host checks after each turn, and the turn that sends its problems back. */
export type Rounds<V extends { ok: true }> = {
  task: SessionTask;
  verify: () => Promise<V | Refused>;
  fix: (problems: readonly string[]) => SessionTask;
};

function failed(outcome: Exclude<AgentOutcome, Ok>): StepResult {
  return outcome.kind === 'rate_limited'
    ? { kind: 'rate_limited', retryAt: null }
    : { kind: 'error', error: outcome.message };
}

function isRefused(verified: { ok: true } | Refused): verified is Refused {
  return !verified.ok;
}

/** The agent's rewrite, sent back with the host's problems until it passes or the rounds run out. */
export async function untilVerified<V extends { ok: true }>(
  rebase: Rebase,
  rounds: Rounds<V>,
): Promise<{ outcome: Ok; verified: V } | StepResult> {
  let outcome = await runInImplementerSession(rebase, rounds.task);
  for (let round = 0; ; round += 1) {
    if (outcome.kind !== 'ok') {
      return failed(outcome);
    }
    const verified = await rounds.verify();
    if (!isRefused(verified)) {
      return { outcome, verified };
    }
    if (round === FIX_ROUNDS) {
      return {
        kind: 'error',
        error: `${verified.problems.join('\n\n')}\n\nThe agent's report:\n\n${outcome.text}`,
      };
    }
    outcome = await continueTask(rebase, rounds.fix(verified.problems), outcome.sessionId);
  }
}

/** The agent's split, sent back with the host's problems until it passes or the rounds run out. */
export function splitUntilVerified(
  rebase: Rebase,
  input: { start: History; slices: readonly PlannedSlice[]; plan: string },
): Promise<{ outcome: Ok; verified: Extract<Verified, { ok: true }> } | StepResult> {
  const task = splitTask(rebase.deps.db, rebase, input);
  return untilVerified(rebase, {
    task,
    verify: () => verifySplit(rebase, { start: input.start, count: input.slices.length }),
    fix: (problems) => fixTask(task, problems),
  });
}
