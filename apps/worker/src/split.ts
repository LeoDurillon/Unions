// Rewrites the ticket's commits into the approved slices with the implementer's session, checks them, pushes the stack and opens it on GitHub.
import {
  latestOutput,
  parseSplitPlan,
  privatePushFiles,
  sliceBranch,
  type PlannedSlice,
} from '@union/core';

import type { ImplementDeps } from './implement-checks';
import type { Rebase } from './rebase-agent';
import { prepareBranch, restorePrepared } from './rebase-prepare';
import type { StepContext, StepResult } from './scheduler';
import { historyOf } from './simplify-git';
import { describeSlices } from './slice-description';
import { renderSplitReport, type PublishedSlice } from './split-agent';
import { fetchStack, publishPushed } from './split-publish';
import { splitUntilVerified } from './split-rounds';

function approvedPlan(rebase: Rebase): { plan: string; slices: PlannedSlice[] } | string {
  const plan = latestOutput(rebase.deps.db, rebase.context.ticket.id, 'split_plan')?.content ?? '';
  const parsed = parseSplitPlan(plan);
  return parsed.ok
    ? { plan, slices: parsed.slices }
    : `The approved plan cannot be read:\n\n${parsed.problems.join('\n')}`;
}

async function attempt(rebase: Rebase): Promise<StepResult> {
  const approved = approvedPlan(rebase);
  if (typeof approved === 'string') {
    return { kind: 'error', error: approved };
  }
  const fetched = await fetchStack(rebase);
  if ('error' in fetched) {
    return { kind: 'error', error: fetched.error };
  }
  const start = await historyOf(rebase.deps.runtime, rebase.container, { base: rebase.base });
  const split = await splitUntilVerified(rebase, { start, ...approved });
  if (!('verified' in split)) {
    return split;
  }
  const count = approved.slices.length;
  const slices: PublishedSlice[] = approved.slices.map((slice, at) =>
    Object.assign(slice, {
      branch: sliceBranch(rebase.branch, slice.position, count),
      tipSha: split.verified.tips[at] ?? '',
      prNumber: null,
    }),
  );
  const session = split.outcome.sessionId;
  const published = await publishPushed(rebase, {
    fetched,
    slices,
    privateFiles: privatePushFiles(rebase.deps.db, rebase.context.ticket),
    describe: () => describeSlices(rebase, { session, fork: start.fork, slices }),
  });
  if ('error' in published) {
    return {
      kind: 'error',
      error: `${published.error}\n\nThe agent's report:\n\n${split.outcome.text}`,
    };
  }
  const output = renderSplitReport({
    agentReport: split.outcome.text,
    slices,
    checks: split.verified.checks,
    warnings: published.warnings,
  });
  return { kind: 'ok', output, sessionId: split.outcome.sessionId };
}

/**
 * Splits the ticket's branch into the approved plan's slices, the code unchanged, with the
 * implementer's own session; pushes every slice's branch in one atomic push and opens the stack on
 * GitHub. Any failure before the push puts the branch back as it was.
 */
export async function runSplitStep(deps: ImplementDeps, context: StepContext): Promise<StepResult> {
  const rebase = await prepareBranch(deps, context);
  const restore = (): Promise<void> => restorePrepared(rebase);
  try {
    const result = await attempt(rebase).catch(async (error: unknown) => {
      await restore();
      throw error;
    });
    if (result.kind !== 'ok') {
      await restore();
    }
    return result;
  } finally {
    await deps.runtime.stop(rebase.container);
  }
}
