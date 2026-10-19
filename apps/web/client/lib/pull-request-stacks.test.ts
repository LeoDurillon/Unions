import { expect, test } from 'bun:test';

import type { CurrentReview, PullRequestListItem } from '../../src/api-types';
import {
  addableMembers,
  reviewStackBottoms,
  reviewStacks,
  splitStacks,
} from './pull-request-stacks';

function pull(number: number, headBranch: string, baseBranch: string): PullRequestListItem {
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
  };
}

function review(prNumber: number, headBranch: string, baseBranch: string): CurrentReview {
  return {
    id: prNumber,
    projectId: 1,
    prNumber,
    title: '',
    url: '',
    author: 'alice',
    headBranch,
    baseBranch,
    fromFork: false,
    headSha: null,
    checkoutSha: null,
    checkoutInRepo: false,
    previewStatus: null,
    submitStatus: null,
    submitError: null,
    notionPageId: null,
    notionTitle: null,
    notionUrl: null,
    createdAt: 0,
  };
}

const list = [pull(9, 'solo', 'main'), pull(13, 'api', 'schema'), pull(12, 'schema', 'main')];

test('open pull requests are split into stacks and the rest; other lists stay flat', () => {
  const split = splitStacks(list, true);
  expect(split.stacks.map((stack) => stack.map((member) => member.number))).toEqual([[12, 13]]);
  expect(split.singles.map((single) => single.number)).toEqual([9]);
  expect(splitStacks(list, false)).toEqual({ stacks: [], singles: list });
});

test("every branch under review maps to its stack's bottom pull request", () => {
  const bottoms = reviewStackBottoms([
    review(13, 'api', 'schema'),
    review(12, 'schema', 'main'),
    review(9, 'solo', 'main'),
  ]);
  expect(Object.fromEntries(bottoms)).toEqual({ api: 12, schema: 12, solo: 9 });
});

test('a stack adds only the members without a ticket that are not under review yet', () => {
  const linked = { ...pull(14, 'ui', 'api'), ticketId: 3 };
  const added = addableMembers(
    [pull(12, 'schema', 'main'), pull(13, 'api', 'schema'), linked],
    new Set([12]),
  );
  expect(added.map((member) => member.number)).toEqual([13]);
});

test('reviews are grouped by stack on their stored branches', () => {
  const stacks = reviewStacks([
    review(13, 'api', 'schema'),
    review(9, 'solo', 'main'),
    review(12, 'schema', 'main'),
  ]);
  expect(stacks.map((stack) => stack.map((member) => member.prNumber))).toEqual([[12, 13], [9]]);
});
