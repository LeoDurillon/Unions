// Moves the rest of a stack onto the base after a slice merged, then targets the base with the new bottom pull request.
import {
  listSlices,
  openSlices,
  schema,
  ticketBase,
  type Db,
  type Project,
  type Ticket,
} from '@union/core';
import { and, eq } from 'drizzle-orm';

import type { ImplementDeps } from './implement-checks';
import { runRebaseStep } from './rebase';
import { loadProject } from './review';
import type { StepContext, StepResult } from './scheduler';
import { followGitHub } from './stack-follow';

/** The tip of the last slice merged into the base under the open ones: where the rest starts. */
function mergedTip(db: Db, ticket: Ticket, base: string): string | null {
  const slices = listSlices(db, ticket.id);
  const firstOpen = slices.findIndex((slice) => slice.prState !== 'merged');
  const merged = slices.slice(0, firstOpen === -1 ? slices.length : firstOpen);
  const last = merged.findLast((slice) => slice.mergedInto === base);
  return last?.mergedTipSha ?? null;
}

/** The new bottom pull request targets the base (GitHub may have done it already). */
async function retargetBottom(
  deps: ImplementDeps,
  input: { project: Project; ticket: Ticket; base: string },
): Promise<string | null> {
  const { project, ticket, base } = input;
  const [bottom] = openSlices(deps.db, ticket.id);
  const api = deps.github(project);
  if (bottom?.prNumber === null || bottom === undefined || api === null) {
    return null;
  }
  try {
    await api.updatePullRequestBase(
      { owner: project.owner, repo: project.repo },
      bottom.prNumber,
      base,
    );
    return `**Retargeted** #${bottom.prNumber} (slice ${bottom.position}) onto \`${base}\`.`;
  } catch (error) {
    return `**Not done on GitHub:** retargeting #${bottom.prNumber} onto \`${base}\`: ${String(error)}`;
  }
}

/**
 * A GitHub stack is rebased by GitHub after a merge: Union follows it. When GitHub could not (a
 * conflict), the worker's own run stops there; the user's Restack rebases with Union.
 */
async function restacked(
  deps: ImplementDeps,
  context: StepContext,
  restack: { upstream: string; hostOnly: boolean },
): Promise<StepResult> {
  const followed =
    context.ticket.githubStackNumber === null ? null : await followGitHub(deps, context);
  if (followed !== null) {
    return followed;
  }
  if (context.ticket.githubStackNumber !== null && restack.hostOnly) {
    return {
      kind: 'error',
      error:
        "GitHub has not rebased the rest of the stack onto the base: use Rebase stack on GitHub, or Restack here to let Union's implementation agent do it.",
    };
  }
  return runRebaseStep(deps, context, { restack });
}

/**
 * After a slice merged, rebases the slices above it onto the base (`--onto`, so the merged commits
 * are not replayed), pushes them together and retargets the new bottom pull request. Started by the
 * worker it runs git alone; asked by the user, the implementer resolves conflicts.
 */
export async function runRestackStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const { ticket } = context;
  const project = loadProject(deps.db, ticket.projectId);
  const base = ticketBase(project, ticket);
  const upstream = mergedTip(deps.db, ticket, base);
  if (upstream === null) {
    return {
      kind: 'error',
      error: `No slice of the stack is merged into \`${base}\` yet: nothing to restack.`,
    };
  }
  const hostOnly = ticket.phase.kind === 'running' && ticket.phase.hostOnly === true;
  const result = await restacked(deps, context, { upstream, hostOnly });
  if (result.kind !== 'ok') {
    return result;
  }
  // Done: the merged slices' tips served their purpose, and Restack is no longer offered.
  deps.db
    .update(schema.ticketSlices)
    .set({ mergedTipSha: null })
    .where(
      and(eq(schema.ticketSlices.ticketId, ticket.id), eq(schema.ticketSlices.prState, 'merged')),
    )
    .run();
  // A GitHub stack is retargeted by GitHub, which refuses Union's change.
  const retargeted =
    ticket.githubStackNumber === null
      ? await retargetBottom(deps, { project, ticket, base })
      : null;
  return retargeted === null ? result : { ...result, output: `${result.output}\n\n${retargeted}` };
}
