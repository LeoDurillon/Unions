// After a slice of a GitHub stack merged, GitHub rebases the rest itself: the workspace takes its branches as they are.
import { emitEvent, openSlices, schema, shortSha, type TicketSlice } from '@union/core';
import { eq } from 'drizzle-orm';

import { remoteOf } from './branch-push';
import { captureDiff } from './diff-snapshot';
import type { Rebase } from './rebase-agent';
import { fetchIntoContainer } from './rebase-fetch';
import { contains, headCommit, restoreBranch } from './rebase-git';
import { prepareBranch } from './rebase-prepare';
import type { StepContext, StepResult } from './scheduler';
import { recordTips, takeRemoteBranches } from './stack-refs';

/** Why the workspace cannot take GitHub's branches: work of its own not pushed yet; null when it can. */
async function unpushed(rebase: Rebase, top: TicketSlice | undefined): Promise<string | null> {
  const head = await headCommit(rebase.deps.runtime, rebase.container);
  return top === undefined || head === top.tipSha
    ? null
    : `The workspace's \`${rebase.branch}\` is at ${shortSha(head)}, not the commit last pushed: it holds work GitHub does not have. Restack moves it with Union instead.`;
}

async function follow(rebase: Rebase): Promise<StepResult | null> {
  const { deps, container, branch, base, context } = rebase;
  const open = openSlices(deps.db, context.ticket.id);
  const lower = open.slice(0, -1);
  const extra = lower.map((slice) => slice.branch);
  await fetchIntoContainer(deps.runtime, container, await remoteOf(deps, rebase.project), {
    base,
    branch,
    extra,
  });
  if (!(await contains(deps.runtime, container, `origin/${branch}`, `origin/${base}`))) {
    return null;
  }
  const problem = await unpushed(rebase, open.at(-1));
  if (problem) {
    return { kind: 'error', error: problem };
  }
  await restoreBranch(deps.runtime, container, branch, `origin/${branch}`);
  await takeRemoteBranches(deps.runtime, container, extra);
  await recordTips(rebase);
  const ticketId = context.ticket.id;
  deps.db.update(schema.tickets).set({ behindBy: 0 }).where(eq(schema.tickets.id, ticketId)).run();
  emitEvent(deps.db, { type: 'stack_followed', ticketId, payload: { branch } });
  await captureDiff(deps.db, deps.runtime, { container, ticketId, base }).catch(
    (error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    },
  );
  const output = `**Followed GitHub:** after the slice below merged, GitHub rebased the rest of the stack onto \`${base}\` and retargeted it. The workspace now matches GitHub. Nothing was pushed and no agent ran: the code reviewed before is the same.`;
  return { kind: 'ok', output, clean: true };
}

/**
 * Takes the stack's branches as GitHub rebased them after a merge, with no push and no agent;
 * null while GitHub has not moved them (a conflict: GitHub shows Rebase stack).
 */
export async function followGitHub(
  deps: Rebase['deps'],
  context: StepContext,
): Promise<StepResult | null> {
  const rebase = await prepareBranch(deps, context);
  try {
    return await follow(rebase);
  } finally {
    await deps.runtime.stop(rebase.container);
  }
}
