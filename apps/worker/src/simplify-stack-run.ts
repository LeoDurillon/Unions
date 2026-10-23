// One simplification of a stack: the fetch and its safety checks, the agent's turns until the host accepts the result, the push.
import type { TicketSlice } from '@union/core';

import type { Rebase } from './rebase-agent';
import { fetchChecked } from './rebase-attempt';
import type { StepResult } from './scheduler';
import { historyOf } from './simplify-git';
import { stackFixTask, stackSimplifyTask, type SliceHistory } from './simplify-stack-agent';
import { pushSimplifiedStack } from './simplify-stack-push';
import { stackProblem, verifyStackSimplify } from './simplify-stack-verify';
import { untilVerified } from './split-rounds';
import { sliceLogs } from './stack-revise-git';

/** Fetch, the stack's checks, the agent's turns until the result passes, then the push. */
export async function simplifyStack(
  rebase: Rebase,
  slices: readonly TicketSlice[],
): Promise<StepResult> {
  const { deps, container, base } = rebase;
  const fetched = await fetchChecked(rebase);
  if ('error' in fetched) {
    return { kind: 'error', error: fetched.error };
  }
  const problem = await stackProblem(rebase, slices);
  if (problem) {
    return { kind: 'error', error: problem };
  }
  const start = await historyOf(deps.runtime, container, { base });
  const logs = await sliceLogs(deps.runtime, container, { fork: start.fork, slices });
  const before: SliceHistory[] = slices.map((slice, at) => ({ slice, log: logs[at] ?? [] }));
  const task = stackSimplifyTask(deps.db, rebase, { start, slices: before });
  const rounds = await untilVerified(rebase, {
    task,
    verify: () => verifyStackSimplify(rebase, { start, slices }),
    fix: (problems) => stackFixTask(task, problems),
  });
  if (!('verified' in rounds)) {
    return rounds;
  }
  return pushSimplifiedStack(rebase, {
    lease: fetched.pushed,
    before,
    verified: rounds.verified,
    outcome: rounds.outcome,
  });
}
