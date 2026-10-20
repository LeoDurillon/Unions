// A revision on a split ticket: the implementer is told the slices, then its new commits are moved into them and the stack pushed.
import {
  emitEvent,
  fixupTarget,
  listSlices,
  restackPlan,
  shortSha,
  sliceTrailer,
  type StackCommit,
  type TicketSlice,
} from '@union/core';

import type { Prepared } from './implement-run';
import type { Ask } from './leftovers';
import type { PublishResult } from './publish';
import { setBranches, stackCommits } from './stack-git';
import { pushRewrittenStack } from './stack-refs';
import { replay, sliceCommits, sliceLogs, stackFork, treeOf } from './stack-revise-git';

const ANSWER = /^(?<sha>[0-9a-f]{7,40})\s+(?<where>Slice:\s*\d+|fixup! \S+)\s*$/u;

function sliceLine(slice: TicketSlice, log: readonly string[], top: number): string {
  const own = slice.position === top ? ", the ticket's own pull request" : '';
  const commits = log.length === 0 ? '' : `: ${log.join('; ')}`;
  return `${slice.position}. **${slice.title}** (\`${slice.branch}\`${own})${commits}`;
}

/** The `# Stack` section of the implementer's prompt; empty when the ticket is not split. */
export async function stackSection(workspace: Prepared): Promise<string> {
  const { deps, container, context, base } = workspace;
  const slices = listSlices(deps.db, context.ticket.id);
  const [bottom] = slices;
  if (bottom === undefined || slices.length < 2) {
    return '';
  }
  const fork = await stackFork(deps.runtime, container, { base, bottomTip: bottom.tipSha });
  const logs = await sliceLogs(deps.runtime, container, { fork, slices });
  const top = slices.length;
  const list = slices.map((slice, at) => sliceLine(slice, logs[at] ?? [], top)).join('\n');
  return `\n\n# Stack\n\nThis ticket's pull request is split into a stack, bottom first; each slice is a pull request on the one below:\n\n${list}\n\nCommit each change where it belongs: end a new commit's message with a \`Slice: <n>\` trailer (on its own line, after a blank line) to add it at the end of slice n, or start its subject with \`fixup! <sha>\` (a sha above) to fold it into that commit. Commit on top of the branch as usual: the host moves your commits into place after your run.`;
}

/** The added commits the host cannot place: no slice named, or no single commit to fix up. */
function unplaced(
  added: readonly StackCommit[],
  known: readonly { sha: string }[],
  count: number,
): StackCommit[] {
  return added.filter((commit) => {
    const fixup = fixupTarget(commit, known);
    if (fixup !== null) {
      return fixup.kind !== 'target';
    }
    const slice = sliceTrailer(commit);
    return slice === null || slice > count;
  });
}

/** Asks the implementer's session where each unplaced commit goes; the commits as if they said so. */
async function placed(
  ask: Ask,
  added: StackCommit[],
  missing: readonly StackCommit[],
): Promise<StackCommit[]> {
  const list = missing.map((commit) => `- ${shortSha(commit.sha)} ${commit.subject}`).join('\n');
  const answer =
    (await ask(
      `The host moves your new commits into the stack's slices, but it cannot place these:\n\n${list}\n\nAnswer one line per commit and nothing else: \`<sha> Slice: <n>\` to add it at the end of slice n, or \`<sha> fixup! <sha of the commit it fixes>\` to fold it into that commit.`,
    )) ?? '';
  const where = new Map<string, string>();
  for (const line of answer.split('\n')) {
    const match = ANSWER.exec(line.trim().replaceAll('`', ''));
    if (match?.groups) {
      where.set(match.groups.sha ?? '', match.groups.where ?? '');
    }
  }
  return added.map((commit) => {
    const said = [...where].find(([sha]) => commit.sha.startsWith(sha))?.[1];
    if (said === undefined) {
      return commit;
    }
    return said.startsWith('fixup! ')
      ? { ...commit, subject: said }
      : { ...commit, body: `${commit.body}\n\n${said}` };
  });
}

export type Restacked = { changed: number[] } | { error: string };

/**
 * Moves the commits the revision added on top of the stack into their slices (`restackPlan`), the
 * code at the end unchanged; null when the ticket is not split or nothing was added.
 */
export async function restackRevision(workspace: Prepared, ask: Ask): Promise<Restacked | null> {
  const { deps, container, context, base } = workspace;
  const { runtime } = deps;
  const slices = listSlices(deps.db, context.ticket.id);
  const [bottom] = slices;
  const top = slices.at(-1);
  if (bottom === undefined || top === undefined || slices.length < 2) {
    return null;
  }
  let added = await stackCommits(runtime, container, top.tipSha);
  if (added.length === 0) {
    return null;
  }
  const fork = await stackFork(runtime, container, { base, bottomTip: bottom.tipSha });
  const stack = await sliceCommits(runtime, container, { fork, slices });
  const known = [...stack.flatMap((slice) => slice.commits.map((sha) => ({ sha }))), ...added];
  const missing = unplaced(added, known, slices.length);
  if (missing.length > 0) {
    added = await placed(ask, added, missing);
  }
  const plan = restackPlan(stack, added);
  if (!plan.ok) {
    return {
      error: `The new commits cannot be placed in the stack:\n\n${plan.problems.join('\n')}`,
    };
  }
  const tree = await treeOf(runtime, container, 'HEAD');
  await setBranches(
    runtime,
    container,
    slices.slice(0, -1).map((slice) => ({ branch: slice.branch, sha: slice.tipSha })),
  );
  const stopped = await replay(runtime, container, { fork, todo: plan.todo });
  if (stopped !== null) {
    return { error: stopped };
  }
  if ((await treeOf(runtime, container, 'HEAD')) !== tree) {
    return {
      error: 'Moving the new commits into their slices changed the code: nothing was pushed.',
    };
  }
  return { changed: plan.changed };
}

/** Pushes the restacked stack in one atomic push, leased on what was last pushed; as `publishBranch` reports. */
export async function pushRevision(workspace: Prepared): Promise<PublishResult> {
  const { deps, context, branch } = workspace;
  const ticketId = context.ticket.id;
  const top = listSlices(deps.db, ticketId).at(-1);
  try {
    await pushRewrittenStack({ ...workspace, before: '' }, top?.tipSha ?? '');
    emitEvent(deps.db, { type: 'branch_pushed', ticketId, payload: { branch } });
    return {
      pushed: true,
      pullRequest: context.ticket.prNumber,
      manualPullRequest: false,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEvent(deps.db, { type: 'publish_failed', ticketId, payload: { branch, error: message } });
    return { pushed: false, pullRequest: null, manualPullRequest: false, error: message };
  }
}
