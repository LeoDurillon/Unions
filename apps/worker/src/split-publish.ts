// The split's way to and from GitHub: the stack's branches fetched with their leases, then pushed and opened.
import { emitEvent, type Ticket } from '@union/core';

import { remoteOf } from './branch-push';
import { captureDiff } from './diff-snapshot';
import type { Rebase } from './rebase-agent';
import { fetchIntoContainer } from './rebase-fetch';
import { contains } from './rebase-git';
import type { PublishedSlice } from './split-agent';
import { remoteSliceBranches, setBranches } from './stack-git';
import { publishStack } from './stack-publish';
import { pushStack, type StackBranch } from './stack-push';

/** What GitHub had before the split: the ticket's branch and the slice branches of an earlier one. */
export type Fetched = { lease: string; slices: Map<string, string> };

/**
 * Fetches the ticket's branch and any slice branch already on GitHub; refuses when one has commits
 * the workspace lacks (someone pushed to it): rewriting would drop them.
 */
export async function fetchStack(rebase: Rebase): Promise<Fetched | { error: string }> {
  const { deps, container, branch, base, project, context } = rebase;
  const ticket: Ticket = context.ticket;
  if (ticket.prNumber === null || deps.github(project) === null) {
    return {
      error: "A split needs the ticket's pull request and GitHub access to open the others.",
    };
  }
  const remote = await remoteOf(deps, project);
  const slices = await remoteSliceBranches(remote, branch);
  const extra = [...slices.keys()];
  const lease = await fetchIntoContainer(deps.runtime, container, remote, { base, branch, extra });
  for (const name of [branch, ...extra]) {
    if (!(await contains(deps.runtime, container, 'HEAD', `origin/${name}`))) {
      return {
        error: `\`${name}\` on GitHub has commits this ticket's workspace does not: rewriting would drop them.`,
      };
    }
  }
  return { lease, slices };
}

function branchesToPush(
  rebase: Rebase,
  fetched: Fetched,
  slices: readonly PublishedSlice[],
): StackBranch[] {
  return slices.map((slice) => ({
    branch: slice.branch,
    lease:
      slice.branch === rebase.branch ? fetched.lease : (fetched.slices.get(slice.branch) ?? null),
  }));
}

/**
 * Pushes the stack in one atomic push, then opens it on GitHub; an earlier split's slice branch the
 * new one has no use for is left as it is, and said so.
 */
export async function publishPushed(
  rebase: Rebase,
  input: {
    fetched: Fetched;
    slices: PublishedSlice[];
    privateFiles: { name: string; blobId: string }[];
  },
): Promise<{ warnings: string[] } | { error: string }> {
  const { deps, container, project, context, base } = rebase;
  const { fetched, slices } = input;
  const api = deps.github(project);
  const { ticket } = context;
  if (api === null || ticket.prNumber === null) {
    return { error: 'The ticket lost its pull request or GitHub access during the split.' };
  }
  const lower = slices.filter((slice) => slice.branch !== rebase.branch);
  await setBranches(
    deps.runtime,
    container,
    lower.map((slice) => ({ branch: slice.branch, sha: slice.tipSha })),
  );
  try {
    await pushStack(deps.runtime, container, await remoteOf(deps, project), {
      branches: branchesToPush(rebase, fetched, slices),
      privateFiles: input.privateFiles,
    });
  } catch (error) {
    return { error: `The push was refused, nothing was pushed: ${String(error)}` };
  }
  emitEvent(deps.db, {
    type: 'branch_pushed',
    ticketId: ticket.id,
    payload: { branch: rebase.branch, split: true },
  });
  await captureDiff(deps.db, deps.runtime, { container, ticketId: ticket.id, base }).catch(
    (error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    },
  );
  const kept = new Set(slices.map((slice) => slice.branch));
  const stale = [...fetched.slices.keys()].filter((name) => !kept.has(name));
  const warnings = await publishStack(
    { db: deps.db, api },
    { project, ticket: { ...ticket, prNumber: ticket.prNumber }, base, slices },
  );
  return {
    warnings: [
      ...warnings,
      ...stale.map(
        (name) =>
          `\`${name}\` is left from an earlier split: close its pull request if it has one.`,
      ),
    ],
  };
}
