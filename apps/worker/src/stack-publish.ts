// Opens the stack on GitHub: a pull request per lower slice, the ticket's own retargeted, their texts, the issue's comment.
import {
  replaceSlices,
  slicePrDescription,
  stackComment,
  stackSection,
  withStackSection,
  type Project,
  type StackEntry,
  type Ticket,
} from '@union/core';

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
  await openPullRequests(stack, warnings);
  await writeTexts(stack, warnings);
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
