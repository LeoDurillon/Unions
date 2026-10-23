// Where the base a ticket left is read from: its merged pull request's ref, else its branch, else the workspace's last copy.
import { emitEvent, schema, type LeftBase } from '@union/core';
import { eq } from 'drizzle-orm';

import { remoteOf } from './branch-push';
import type { GitHubApi, RepoRef } from './github/api';
import type { CloneSource } from './provision';
import type { Rebase } from './rebase-agent';
import { dropBuildsOn, missingBranches } from './retarget-github';
import type { StepResult } from './scheduler';
import { refExists } from './workspace-git';

/**
 * The GitHub ref the left base is fetched from: its merged pull request's head (what was merged,
 * kept after the branch is deleted), else its branch while it exists; null when GitHub has neither.
 */
async function leftSource(remote: CloneSource, left: LeftBase): Promise<string | null> {
  if (left.prNumber !== null) {
    return `refs/pull/${left.prNumber}/head`;
  }
  const missing = await missingBranches(remote, [left.branch]);
  return missing.length === 0 ? `refs/heads/${left.branch}` : null;
}

/**
 * The ref a change of target reads the base it leaves from: its branch while it exists (a live base
 * moves on), else, deleted after a merge, its merged pull request's head; null when neither.
 */
export async function retargetSource(
  github: { api: GitHubApi; repo: RepoRef; remote: CloneSource },
  left: LeftBase,
): Promise<string | null> {
  const branch = await leftSource(github.remote, { branch: left.branch, prNumber: null });
  if (branch !== null) {
    return branch;
  }
  const merged = left.prNumber ?? (await github.api.mergedPullRequest(github.repo, left.branch));
  return merged === null ? null : `refs/pull/${merged}/head`;
}

/**
 * The move of a rebase after GitHub moved the pull request off `left_base`: only the ticket's own
 * commits go onto the new base. None (a plain rebase, said in the Log) when the left base can be
 * read neither from GitHub nor from the workspace.
 */
export async function followedMove(rebase: Rebase): Promise<Rebase['retarget']> {
  const left = rebase.context.ticket.leftBase;
  if (!left) {
    return undefined;
  }
  const { deps, container, context } = rebase;
  const source = await leftSource(await remoteOf(deps, rebase.project), left);
  if (source === null && !(await refExists(deps.runtime, container, `origin/${left.branch}`))) {
    context.log({
      type: 'union_note',
      text: `\`${left.branch}\`, the base GitHub moved the pull request off, is gone: a plain rebase onto \`${rebase.base}\``,
    });
    return undefined;
  }
  return { from: left.branch, source };
}

/** The left base's commits are behind the pushed branch now: the ticket is on its base alone. */
function clearLeftBase(rebase: Rebase): void {
  const { deps, context } = rebase;
  const left = context.ticket.leftBase;
  if (!left) {
    return;
  }
  deps.db
    .update(schema.tickets)
    .set({ leftBase: null })
    .where(eq(schema.tickets.id, context.ticket.id))
    .run();
  emitEvent(deps.db, {
    type: 'left_base_dropped',
    ticketId: context.ticket.id,
    payload: { branch: left.branch },
  });
}

/** Once the left base's commits stayed behind: no more left base, nor its "Builds on" line. */
export async function afterFollowed(rebase: Rebase, result: StepResult): Promise<StepResult> {
  if (result.kind !== 'ok') {
    return result;
  }
  clearLeftBase(rebase);
  const { deps, project, context } = rebase;
  const api = deps.github(project);
  const note =
    api === null || context.ticket.prNumber === null
      ? ''
      : await dropBuildsOn(api, project, context.ticket.prNumber);
  const from = context.ticket.leftBase?.branch ?? '';
  const moved = rebase.retarget
    ? `**Left \`${from}\` behind:** GitHub had moved the pull request onto \`${rebase.base}\`; only this ticket's commits were moved onto it.`
    : `**Rebased onto \`${rebase.base}\`:** \`${from}\`, the base GitHub moved the pull request off, was gone from GitHub and the workspace, so its commits could not be told apart.`;
  return { ...result, output: `${moved}\n\n${result.output}${note}` };
}
