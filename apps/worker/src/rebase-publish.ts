// Checks the result, runs the project's checks, then pushes; returns why it could not, the hook's
// refusal of the agent's leftover changes, or the gate.
import { emitEvent, openSlices, schema, type Db, type RefusedCommit } from '@union/core';
import { eq } from 'drizzle-orm';

import { forcePush } from './branch-push';
import { captureDiff } from './diff-snapshot';
import { runGate, type GateResult } from './gate';
import { commitLeftovers, type Refused } from './leftovers';
import { askRebaseAgent, renderRebaseReport, type Pushed, type Rebase } from './rebase-agent';
import { carriedOver, headCommit, rebaseProblem, stackMoveProblem } from './rebase-git';
import { outcomeOf, pauseOnRefusal, pendingRefusal, resumeRefusal } from './refused-commit';
import type { StepResult } from './scheduler';

/**
 * Checks the result, runs the project's checks, then pushes; returns why it could not, the hook's
 * refusal of the agent's leftover changes, or the gate.
 */
export async function verifyAndPush(
  rebase: Rebase,
  { pushed, outcome }: { pushed: string; outcome: Pushed['outcome'] },
): Promise<{ error: string } | { refused: Refused } | { gate: GateResult | null }> {
  const { deps, container, project } = rebase;
  const lower = openSlices(deps.db, rebase.context.ticket.id).slice(0, -1);
  const problem =
    (await rebaseProblem(deps.runtime, container, rebase)) ??
    (await carriedOver(deps.runtime, container, rebase)) ??
    (await stackMoveProblem(deps.runtime, container, { base: rebase.base, lower }));
  if (problem) {
    return { error: problem };
  }
  const leftovers = await commitLeftovers(deps.runtime, container, {
    report: outcome.text,
    ask: askRebaseAgent(rebase, outcome.sessionId),
  });
  if (leftovers.kind === 'refused') {
    return { refused: leftovers };
  }
  const { gateCommand } = project.config;
  await deps.services?.ensure();
  const gate = gateCommand
    ? await runGate(deps.runtime, container, gateCommand, rebase.context.signal)
    : null;
  if (gate && !gate.green) {
    return {
      error: `The checks fail after the rebase (exit ${gate.exitCode}):\n\n\`\`\`\n${gate.tail}\n\`\`\``,
    };
  }
  const refused = await forcePush(rebase, pushed);
  return refused === null ? { gate } : { error: refused };
}

/** After the push: the branch is current and the review diff is refreshed; returns the new head. */
export async function afterPush(rebase: Rebase): Promise<string> {
  const { deps, context, container, branch, base } = rebase;
  const ticketId = context.ticket.id;
  emitEvent(deps.db, { type: 'branch_pushed', ticketId, payload: { branch, rebased: true } });
  deps.db.update(schema.tickets).set({ behindBy: 0 }).where(eq(schema.tickets.id, ticketId)).run();
  await captureDiff(deps.db, deps.runtime, { container, ticketId, base }).catch(
    (error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    },
  );
  return headCommit(deps.runtime, container);
}

/** After the agent's rebase was pushed: its report, under what the host checked, is the output. */
export async function published(rebase: Rebase, { outcome, gate }: Pushed): Promise<StepResult> {
  const output = renderRebaseReport({
    agentReport: outcome.text,
    rebase,
    after: await afterPush(rebase),
    gateCommand: rebase.project.config.gateCommand,
    gate,
  });
  return { kind: 'ok', output, sessionId: outcome.sessionId };
}

/** Stops the rebase on a refused commit, keeping what the run needs to push once the user decides. */
export function pauseRebase(
  rebase: Rebase,
  { refused, outcome, lease }: { refused: Refused; outcome: Pushed['outcome']; lease: string },
): StepResult {
  return pauseOnRefusal(rebase.deps.db, {
    ticketId: rebase.context.ticket.id,
    // A rebase that leaves a followed base moves like a change of target but stays a rebase.
    step: rebase.context.step === 'retarget' ? 'retarget' : 'rebase',
    refused,
    report: outcome.text,
    sessionId: outcome.sessionId,
    resumeState: { lease, before: rebase.before },
  });
}

/** The decision a resumed rebase applies. */
export function pausedRebase(db: Db, ticketId: number, step: 'rebase' | 'retarget'): RefusedCommit {
  return pendingRefusal(db, ticketId, step);
}

/** Finishes a rebase paused on a refused commit: the user's decision, then the checks and the push. */
export async function resumeRebase(
  rebase: Rebase,
  refusal: RefusedCommit,
): Promise<StepResult | Pushed> {
  const { lease } = refusal.resumeState;
  if (!lease) {
    return {
      kind: 'error',
      error: 'The paused rebase did not record the branch it was to replace',
    };
  }
  const paused = await resumeRefusal(rebase.deps, rebase.container, refusal);
  if (paused) {
    return paused;
  }
  const outcome = outcomeOf(refusal);
  const checked = await verifyAndPush(rebase, { pushed: lease, outcome });
  if ('error' in checked) {
    return { kind: 'error', error: `${checked.error}\n\nThe agent's report:\n\n${refusal.report}` };
  }
  if ('refused' in checked) {
    return {
      kind: 'error',
      error: 'The hook refused another commit after the decision was applied',
    };
  }
  return { pushed: true, outcome, gate: checked.gate };
}
