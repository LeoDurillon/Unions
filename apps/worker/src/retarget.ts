// Moves a finished ticket's own commits onto another base branch, then points its pull request at it.
import { emitEvent, listSlices, schema, ticketBase, type Project, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import { remoteOf } from './branch-push';
import type { GitHubApi } from './github/api';
import type { ImplementDeps } from './implement-checks';
import { runRebaseStep } from './rebase';
import { currentBase, missingBranches, moveOnGitHub } from './retarget-github';
import { loadProject } from './review';
import type { StepContext, StepResult } from './scheduler';

type Move = { api: GitHubApi; project: Project; number: number; from: string; to: string };

/** The base the branch leaves: the pull request's now, else (already on `to` there) the ticket's. */
function leftBase(prBase: string, ticket: Ticket, project: Project, to: string): string {
  return prBase === to ? ticketBase(project, ticket) : prBase;
}

/** What the move needs, or why it cannot run: an open pull request, no stack, both branches on GitHub. */
async function prepareMove(deps: ImplementDeps, ticket: Ticket): Promise<Move | { error: string }> {
  const project = loadProject(deps.db, ticket.projectId);
  const to = ticket.retargetBranch;
  const api = deps.github(project);
  if (to === null || ticket.prNumber === null || api === null) {
    return {
      error: 'Nothing to retarget: no target was chosen, or no pull request or GitHub access',
    };
  }
  if (listSlices(deps.db, ticket.id).length > 0) {
    return { error: 'The ticket is split into a stack: split it again on the new base instead.' };
  }
  const pr = await currentBase(api, project, ticket.prNumber);
  if ('error' in pr) {
    return pr;
  }
  const from = leftBase(pr.base, ticket, project, to);
  if (from === to) {
    return { error: `The pull request already targets \`${to}\`.` };
  }
  const missing = await missingBranches(await remoteOf(deps, project), [from, to]);
  if (missing.length > 0) {
    const names = missing.map((name) => `\`${name}\``).join(' and ');
    return { error: `${names} no longer exist on GitHub: rebase first, or choose another target.` };
  }
  return { api, project, number: ticket.prNumber, from, to };
}

/** The ticket is now based on `to`, as if chosen there from the start. */
function recordMove(deps: ImplementDeps, ticketId: number, move: Move): void {
  const { from, to, number } = move;
  deps.db.transaction((tx) => {
    tx.update(schema.tickets)
      .set({ baseBranch: to, chosenBaseBranch: to, retargetBranch: null })
      .where(eq(schema.tickets.id, ticketId))
      .run();
    emitEvent(tx, { type: 'ticket_retargeted', ticketId, payload: { from, to, number } });
  });
}

/**
 * `git rebase --onto` the new base of the commits after the old one (git alone, the implementer
 * only for conflicts or failing checks), the push, then the pull request's base on GitHub. When
 * GitHub refuses that last part, a retry finds the branch already moved and only retargets.
 */
export async function runRetargetStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const move = await prepareMove(deps, context.ticket);
  if ('error' in move) {
    return { kind: 'error', error: move.error };
  }
  const { from, to, number } = move;
  const result = await runRebaseStep(deps, context, { retarget: { from, to } });
  if (result.kind !== 'ok') {
    return result;
  }
  const note = await moveOnGitHub(move.api, move.project, { number, to }).catch(
    (error: unknown) => ({
      error: `The branch was moved onto \`${to}\` and pushed, but GitHub refused to retarget #${number}: ${String(error)}. Retry to set it again.`,
    }),
  );
  if (typeof note !== 'string') {
    return { kind: 'error', ...note };
  }
  recordMove(deps, context.ticket.id, move);
  const retargeted = `**Retargeted** #${number} from \`${from}\` to \`${to}\`: only this ticket's commits moved.`;
  return { ...result, output: `${retargeted}\n\n${result.output}${note}` };
}
