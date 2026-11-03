import { expect, test } from 'bun:test';

import { diffLinkOf } from './diff-links';

const changed = new Set(['src/app.ts', 'docs/adr/0001-layers.md']);

test('a changed path opens the diff, at its lines when given', () => {
  expect(diffLinkOf('src/app.ts', changed)).toEqual({ path: 'src/app.ts', lines: null });
  expect(diffLinkOf('src/app.ts:12', changed)).toEqual({
    path: 'src/app.ts',
    lines: { start: 12, end: 12 },
  });
  expect(diffLinkOf(' ./src/app.ts:12-30 ', changed)).toEqual({
    path: 'src/app.ts',
    lines: { start: 12, end: 30 },
  });
  expect(diffLinkOf('src/app.ts:L30–L12', changed)?.lines).toEqual({ start: 12, end: 30 });
});

test('anything else stays plain code', () => {
  for (const text of ['src/other.ts:3', 'bun run check', 'app.ts', 'src/app.ts:abc', '']) {
    expect(diffLinkOf(text, changed)).toBeNull();
  }
  expect(diffLinkOf('src/app.ts:0', changed)).toEqual({ path: 'src/app.ts', lines: null });
});
