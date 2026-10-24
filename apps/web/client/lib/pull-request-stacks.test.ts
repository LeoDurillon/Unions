import { expect, test } from 'bun:test';

import type { GitHubStack } from '@union/core/github-stacks';

import type { CurrentReview, PullRequestListItem } from '../../src/api-types';
import {
  addableMembers,
  reviewStackBottoms,
  reviewStacks,
  splitStacks,
  unlistedMembers,
} from './pull-request-stacks';

/** `stack`: its GitHub stack and place there. */
function pull(
  number: number,
  headBranch: string,
  baseBranch: string,
  stack: [number, number] | null = null,
): PullRequestListItem {
  return {
    number,
    title: `PR ${number}`,
    url: '',
    state: 'open',
    draft: false,
    author: 'alice',
    headBranch,
    baseBranch,
    crossRepository: false,
    updatedAt: '',
    reviewDecision: null,
    additions: 0,
    deletions: 0,
    ticketId: null,
    stack: stack ? { number: stack[0], position: stack[1] } : null,
  };
}

function review(prNumber: number, stack: [number, number] | null): CurrentReview {
  return {
    id: prNumber,
    projectId: 1,
    prNumber,
    title: '',
    url: '',
    author: 'alice',
    headBranch: `b${prNumber}`,
    baseBranch: 'main',
    fromFork: false,
    headSha: null,
    checkoutSha: null,
    checkoutInRepo: false,
    previewStatus: null,
    submitStatus: null,
    submitError: null,
    notionPages: [],
    githubStackNumber: stack?.[0] ?? null,
    stackPosition: stack?.[1] ?? null,
    createdAt: 0,
  };
}

function githubStack(number: number, pulls: number[]): GitHubStack {
  return {
    number,
    open: true,
    base: 'main',
    pullRequests: pulls.map((n) => ({
      number: n,
      state: n === 11 ? 'closed' : 'open',
      mergedAt: n === 11 ? 1 : null,
      headRef: `b${n}`,
      headSha: 's',
    })),
  };
}

const chained = [pull(9, 'solo', 'main'), pull(13, 'api', 'schema'), pull(12, 'schema', 'main')];

test("GitHub's stacks group the list, in any filter; branches alone group nothing", () => {
  const list = [
    pull(9, 'solo', 'main'),
    pull(13, 'api', 'schema', [1, 2]),
    pull(12, 'schema', 'main', [1, 1]),
    pull(20, 'x', 'main', [2, 1]),
  ];
  const split = splitStacks(list, [githubStack(1, [11, 12, 13]), githubStack(2, [21, 20])], false);
  expect(split.stacks.map((row) => row.pulls.map((member) => member.number))).toEqual([
    [12, 13],
    [20],
  ]);
  expect(split.stacks.map((row) => unlistedMembers(row).map((member) => member.number))).toEqual([
    [11],
    [21],
  ]);
  expect(split.singles.map((single) => single.number)).toEqual([9]);
  expect(splitStacks(chained, [], true).stacks).toEqual([]);
});

test('where GitHub has no stacks, open pull requests chain by branch; other lists stay flat', () => {
  const split = splitStacks(chained, null, true);
  expect(split.stacks.map((row) => row.pulls.map((member) => member.number))).toEqual([[12, 13]]);
  expect(split.singles.map((single) => single.number)).toEqual([9]);
  expect(splitStacks(chained, null, false)).toEqual({ stacks: [], singles: chained });
});

test('reviews are grouped by their GitHub stack, bottom first; each stack maps to its bottom', () => {
  const reviews = [review(13, [1, 2]), review(9, null), review(12, [1, 1]), review(30, [4, 0])];
  expect(reviewStacks(reviews).map((stack) => stack.map((member) => member.prNumber))).toEqual([
    [12, 13],
    [9],
    [30],
  ]);
  expect(Object.fromEntries(reviewStackBottoms(reviews))).toEqual({ 1: 12, 4: 30 });
});

test('a stack adds only the members without a ticket that are not under review yet', () => {
  const linked = { ...pull(14, 'ui', 'api'), ticketId: 3 };
  const added = addableMembers(
    [pull(12, 'schema', 'main'), pull(13, 'api', 'schema'), linked],
    new Set([12]),
  );
  expect(added.map((member) => member.number)).toEqual([13]);
});
