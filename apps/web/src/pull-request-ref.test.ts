import { expect, test } from 'bun:test';

import { parsePullRequestRef } from './pull-request-ref';

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
