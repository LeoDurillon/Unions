// Opens the stack on GitHub: a pull request per lower slice, the ticket's own retargeted, their texts, the issue's comment.
import {
  replaceSlices,
  schema,
  slicePrDescription,
  stackComment,
  stackSection,
  withStackSection,
  type Project,
  type StackEntry,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './github/api';
import type { PublishedSlice } from './split-agent';

type Stack = {
  api: GitHubApi;
  repo: RepoRef;
  ticket: Ticket & { prNumber: number };
  base: string;
  slices: PublishedSlice[];
};

/** The lower slice's pull request, reused when a split ran before; opened on the slice below. */
async function lowerPullRequest(
  stack: Stack,
  slice: PublishedSlice,
  base: string,
): Promise<number> {
  const { api, repo, ticket } = stack;
  const found = await api.findPullRequest(repo, slice.branch);
  if (found) {
    await api.updatePullRequestBase(repo, found.number, base);
    await api.updatePullRequestTitle(repo, found.number, slice.title);
    return found.number;
  }
  const opened = await api.createPullRequest(repo, {
    title: slice.title,
    body: '',
    head: slice.branch,
    base,
  });
  // Split after the final approval: the rest of the stack is ready for review too.
  if (ticket.prReadyAt !== null) {
    await api.markPullRequestReady(repo, opened.number);
  }
  return opened.number;
}

async function openPullRequests(stack: Stack, warnings: string[]): Promise<void> {
  const { slices, ticket, base } = stack;
  for (const [at, slice] of slices.entries()) {
    const below = slices[at - 1]?.branch ?? base;
    try {
      if (at === slices.length - 1) {
        await stack.api.updatePullRequestBase(stack.repo, ticket.prNumber, below);
        slice.prNumber = ticket.prNumber;
      } else {
        slice.prNumber = await lowerPullRequest(stack, slice, below);
      }
    } catch (error) {
      warnings.push(`Slice ${slice.position}'s pull request (onto \`${below}\`): ${String(error)}`);
    }
  }
}

/** The top slice keeps the ticket's description with the stack in it; the others get their own. */
async function textOf(stack: Stack, slice: PublishedSlice, number: number): Promise<string> {
  const entries: StackEntry[] = stack.slices;
  const top = stack.slices.at(-1)?.position ?? 0;
  if (slice.position !== top) {
    return slicePrDescription({ slice, stack: entries, issueNumber: stack.ticket.issueNumber });
  }
  const body = await stack.api.pullRequestBody(stack.repo, number);
  return withStackSection(body, stackSection(entries, top));
}

async function writeTexts(stack: Stack, warnings: string[]): Promise<void> {
  const { api, repo, ticket, slices } = stack;
  try {
    for (const slice of slices) {
      if (slice.prNumber !== null) {
        await api.updatePullRequestBody(
          repo,
          slice.prNumber,
          await textOf(stack, slice, slice.prNumber),
        );
      }
    }
    if (ticket.issueNumber !== null) {
      await api.createComment(repo, ticket.issueNumber, stackComment(slices));
    }
  } catch (error) {
    warnings.push(`The pull requests' descriptions or the issue's comment: ${String(error)}`);
  }
}

/**
 * Dissolves an earlier split's GitHub stack first: GitHub refuses to retarget a pull request that is
 * part of a stack.
 */
async function dissolveEarlier(stack: Stack, warnings: string[]): Promise<void> {
  const { api, repo, ticket } = stack;
  if (ticket.githubStackNumber === null) {
    return;
  }
  try {
    await api.unstack(repo, ticket.githubStackNumber);
  } catch (error) {
    warnings.push(`Dissolving the earlier stack on GitHub: ${String(error)}`);
  }
}

/**
 * Makes the pull requests a GitHub stack (a stack map on each, merges from the bottom, the rest
 * rebased by GitHub after a merge). Null where GitHub has no stacks, or when a pull request is
 * missing: Union then keeps the stack alone.
 */
async function stackOnGitHub(stack: Stack, warnings: string[]): Promise<number | null> {
  const { api, repo, slices } = stack;
  const numbers = slices.flatMap((slice) => (slice.prNumber === null ? [] : [slice.prNumber]));
  if (numbers.length !== slices.length) {
    return null;
  }
  try {
    return await api.createStack(repo, numbers);
  } catch (error) {
    warnings.push(`The stack on GitHub (Union keeps it alone): ${String(error)}`);
    return null;
  }
}

/**
 * Publishes the pushed stack on GitHub and records its slices. What GitHub refuses is returned as
 * warnings: the branches are already pushed, so the split stands and a new split can finish it.
 */
export async function publishStack(
  deps: { db: Parameters<typeof replaceSlices>[0]; api: GitHubApi },
  input: {
    project: Project;
    ticket: Ticket & { prNumber: number };
    base: string;
    slices: PublishedSlice[];
  },
): Promise<string[]> {
  const { project, ticket, base, slices } = input;
  const stack: Stack = {
    api: deps.api,
    repo: { owner: project.owner, repo: project.repo },
    ticket,
    base,
    slices,
  };
  const warnings: string[] = [];
  await dissolveEarlier(stack, warnings);
  await openPullRequests(stack, warnings);
  await writeTexts(stack, warnings);
  const githubStackNumber = await stackOnGitHub(stack, warnings);
  deps.db
    .update(schema.tickets)
    .set({ githubStackNumber })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  replaceSlices(
    deps.db,
    ticket.id,
    slices.map((slice) => ({
      position: slice.position,
      title: slice.title,
      spec: slice.spec,
      tipSha: slice.tipSha,
      branch: slice.branch,
      prNumber: slice.prNumber,
      prState: slice.prNumber === null ? null : 'open',
    })),
  );
  return warnings;
}
