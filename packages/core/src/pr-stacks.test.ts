import { expect, test } from 'bun:test';

import type { GitHubStack } from './github-stacks';
import { placedStacks, pullRequestStacks, stackPlaces, type StackMember } from './pr-stacks';

function pr(number: number, headBranch: string, baseBranch: string, fork = false): StackMember {
  return { number, headBranch, baseBranch, crossRepository: fork };
}

function numbers(pulls: StackMember[]): number[][] {
  return pullRequestStacks(pulls).map((stack) => stack.map((pull) => pull.number));
}

test('a chain is one stack, bottom first, whatever order it is listed in', () => {
  expect(numbers([pr(14, 'ui', 'api'), pr(12, 'schema', 'main'), pr(13, 'api', 'schema')])).toEqual(
    [[12, 13, 14]],
  );
});

test('pull requests on no other are stacks of one, in the order listed', () => {
  expect(numbers([pr(3, 'a', 'main'), pr(1, 'b', 'main'), pr(2, 'c', 'develop')])).toEqual([
    [3],
    [1],
    [2],
  ]);
});

test('a stack sits where its first listed member is', () => {
  expect(
    numbers([pr(9, 'solo', 'main'), pr(13, 'api', 'schema'), pr(12, 'schema', 'main')]),
  ).toEqual([[9], [12, 13]]);
});

test('two pull requests on the same one follow it, one after the other', () => {
  expect(
    numbers([
      pr(12, 'schema', 'main'),
      pr(13, 'api', 'schema'),
      pr(15, 'docs', 'schema'),
      pr(14, 'ui', 'api'),
    ]),
  ).toEqual([[12, 13, 14, 15]]);
});

test("a fork's branch is no base for another pull request, but a fork can stack on ours", () => {
  expect(numbers([pr(20, 'schema', 'main', true), pr(21, 'api', 'schema')])).toEqual([[20], [21]]);
  expect(numbers([pr(12, 'schema', 'main'), pr(22, 'fix', 'schema', true)])).toEqual([[12, 22]]);
});

test('branches that target each other still give every pull request once', () => {
  expect(numbers([pr(1, 'a', 'b'), pr(2, 'b', 'a'), pr(3, 'c', 'c')])).toEqual([[1, 2], [3]]);
});

test('no pull requests, no stacks', () => {
  expect(pullRequestStacks([])).toEqual([]);
});

function githubStack(number: number, pulls: number[], open = true): GitHubStack {
  return {
    number,
    open,
    base: 'main',
    pullRequests: pulls.map((pull) => ({
      number: pull,
      state: 'open',
      mergedAt: null,
      headRef: `b${pull}`,
      headSha: 'sha',
    })),
  };
}

function placed(listed: number[], stacks: GitHubStack[]): number[][] {
  const places = stackPlaces(stacks);
  return placedStacks(listed, (number) => places.get(number) ?? null);
}

test('a GitHub stack groups its members bottom first, where the first one is listed', () => {
  expect(placed([9, 14, 12, 13], [githubStack(1, [12, 13, 14])])).toEqual([[9], [12, 13, 14]]);
});

test('members of a GitHub stack not listed leave the others in it, in order', () => {
  expect(placed([14, 12], [githubStack(1, [11, 12, 13, 14])])).toEqual([[12, 14]]);
});

test('two GitHub stacks stay apart; a closed one groups nothing', () => {
  expect(
    placed(
      [1, 2, 3, 4, 5],
      [githubStack(1, [1, 3]), githubStack(2, [2, 4]), githubStack(3, [5], false)],
    ),
  ).toEqual([[1, 3], [2, 4], [5]]);
});

test('each pull request gets its stack and its place from the bottom', () => {
  expect([...stackPlaces([githubStack(4, [20, 21])])]).toEqual([
    [20, { number: 4, position: 0 }],
    [21, { number: 4, position: 1 }],
  ]);
});
