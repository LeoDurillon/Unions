import { expect, test } from 'bun:test';

import { pullRequestStacks, type StackMember } from './pr-stacks';

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
