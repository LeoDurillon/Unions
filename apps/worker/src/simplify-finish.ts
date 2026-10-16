// After the agent: its leftover commit (a hook may refuse it and pause the run), the checks on the new history, the push.
import { markRefusalResolved, type RefusedCommit } from '@union/core';

import type { AgentOutcome } from './agent';
import { commitLeftovers } from './leftovers';
import { askInSession, runInImplementerSession, type Rebase } from './rebase-agent';
import { branchProblem, headCommit, restoreBranch } from './rebase-git';
import { outcomeOf, pauseOnRefusal, resolutionNote, resumeRefusal } from './refused-commit';
import type { StepResult } from './scheduler';
import { renderSimplifyReport, simplifyTask } from './simplify-agent';
import { historyOf, simplifyProblem, type History } from './simplify-git';
import { pushIfRewritten } from './simplify-push';

type Ok = Extract<AgentOutcome, { kind: 'ok' }>;
type Run = { lease: string; start: History; outcome: Ok };

/** Resumes the implementer's session with the simplify prompt. */
export function runSimplifyAgent(rebase: Rebase, start: History): Promise<AgentOutcome> {
  return runInImplementerSession(rebase, simplifyTask(rebase.deps.db, rebase, start));
}

/** Checks the new history keeps the code and its fork point, then pushes it; the step's result. */
async function pushChecked(rebase: Rebase, { lease, start, outcome }: Run): Promise<StepResult> {
  const { deps, container, branch, base } = rebase;
  const problem =
    (await simplifyProblem(deps.runtime, container, { branch, base, start })) ??
    (await pushIfRewritten(rebase, lease));
  if (problem) {
    return { kind: 'error', error: `${problem}\n\nThe agent's report:\n\n${outcome.text}` };
  }
  const output = renderSimplifyReport({
    agentReport: outcome.text,
    branch,
    start,
    end: await historyOf(deps.runtime, container, { base }),
    commits: { before: lease, after: await headCommit(deps.runtime, container) },
  });
  return { kind: 'ok', output, sessionId: outcome.sessionId };
}

/** Commits what the agent left (its own message), pausing when a hook refuses; then checks and pushes. */
export async function finishSimplify(rebase: Rebase, run: Run): Promise<StepResult> {
  const { deps, context, container } = rebase;
  const problem = await branchProblem(deps.runtime, container, rebase.branch);
  if (problem) {
    return { kind: 'error', error: `${problem}\n\nThe agent's report:\n\n${run.outcome.text}` };
  }
  const task = simplifyTask(deps.db, rebase, run.start);
  const leftovers = await commitLeftovers(deps.runtime, container, {
    report: run.outcome.text,
    ask: askInSession(rebase, task, run.outcome.sessionId),
  });
  if (leftovers.kind === 'refused') {
    return pauseOnRefusal(deps.db, {
      ticketId: context.ticket.id,
      step: 'simplify',
      refused: leftovers,
      report: run.outcome.text,
      sessionId: run.outcome.sessionId,
      resumeState: { lease: run.lease, before: rebase.before },
    });
  }
  return pushChecked(rebase, run);
}

/**
 * The user's decision on a refused commit: committed without the hooks, then checked and pushed; or
 * the old history kept (leaving the changes out would change the code).
 */
export async function resumeSimplify(rebase: Rebase, refusal: RefusedCommit): Promise<StepResult> {
  const { deps, container, branch, base, before } = rebase;
  const outcome = outcomeOf(refusal);
  if (refusal.resolution !== 'commit') {
    markRefusalResolved(deps.db, refusal.id);
    await restoreBranch(deps.runtime, container, branch, before);
    const output = `${refusal.report.trim()}\n\n---\n\n**History kept:** a hook refused a commit and you chose to keep the branch as it was; nothing was pushed.`;
    return { kind: 'ok', output, sessionId: outcome.sessionId };
  }
  const { lease } = refusal.resumeState;
  if (!lease) {
    return {
      kind: 'error',
      error: 'The paused simplification did not record the branch it was to replace',
    };
  }
  const paused = await resumeRefusal(deps, container, refusal);
  if (paused) {
    return paused;
  }
  const start = await historyOf(deps.runtime, container, { base, ref: before });
  const report = { ...outcome, text: `${outcome.text.trim()}\n\n${resolutionNote(refusal)}` };
  return pushChecked(rebase, { lease, start, outcome: report });
}
