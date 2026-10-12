import { expect, test } from 'bun:test';

import { parseIssueRef, parsePullRequestRef } from './pull-request-ref';

test('numbers, #numbers and URLs of the same repository are accepted', () => {
  expect(parsePullRequestRef('12', 'acme', 'shop')).toBe(12);
  expect(parsePullRequestRef(' #34 ', 'acme', 'shop')).toBe(34);
  expect(parsePullRequestRef('https://github.com/Acme/shop/pull/56/files', 'acme', 'shop')).toBe(
    56,
  );
});

test('other repositories and anything else are refused', () => {
  expect(parsePullRequestRef('https://github.com/acme/other/pull/56', 'acme', 'shop')).toBeNull();
  expect(parsePullRequestRef('https://github.com/acme/shop/issues/56', 'acme', 'shop')).toBeNull();
  expect(parsePullRequestRef('0', 'acme', 'shop')).toBeNull();
  expect(parsePullRequestRef('twelve', 'acme', 'shop')).toBeNull();
});

test('issues take a number or an issue URL of the same repository, not a pull request URL', () => {
  expect(parseIssueRef('#12', 'acme', 'shop')).toBe(12);
  expect(
    parseIssueRef('https://github.com/Acme/Shop/issues/12#issuecomment-1', 'acme', 'shop'),
  ).toBe(12);
  expect(parseIssueRef('https://github.com/acme/shop/pull/12', 'acme', 'shop')).toBeNull();
  expect(parseIssueRef('https://github.com/other/shop/issues/12', 'acme', 'shop')).toBeNull();
  expect(parsePullRequestRef('https://github.com/acme/shop/issues/12', 'acme', 'shop')).toBeNull();
});
