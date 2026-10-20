import { expect, test } from 'bun:test';

import { fixupTarget, sliceTips, sliceTrailer, type StackCommit } from './stack-trailers';

function commit(sha: string, slice: number | null, subject = 'Change'): StackCommit {
  const body = slice === null ? 'Body.' : `Body.\n\nSlice: ${slice}\n`;
  return { sha: sha.padEnd(40, '0'), subject, body };
}

test('the last Slice trailer names the slice', () => {
  expect(sliceTrailer(commit('a1', 2))).toBe(2);
  expect(sliceTrailer({ sha: 'a', subject: 's', body: 'Slice: 1\n\nSlice: 3' })).toBe(3);
  expect(sliceTrailer({ sha: 'a', subject: 's', body: 'See Slice: 2 below' })).toBeNull();
  expect(sliceTrailer({ sha: 'a', subject: 's', body: 'Slice: 0' })).toBeNull();
});

test('slice tips are the last commit of each slice', () => {
  const commits = [commit('a1', 1), commit('b1', 2), commit('b2', 2), commit('c1', 3)];
  expect(sliceTips(commits, 3)).toEqual({
    ok: true,
    tips: ['a1', 'b2', 'c1'].map((name) => name.padEnd(40, '0')),
  });
});

test('missing trailers, slices going back, unknown slices and empty slices are refused', () => {
  const result = sliceTips(
    [commit('a1', 1), commit('b1', 3), commit('c1', 2), commit('d1', null), commit('e1', 5)],
    3,
  );
  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.problems).toEqual([
    'c1000000 "Change" names slice 2 after slice 3.',
    'd1000000 "Change" has no `Slice:` trailer.',
    'e1000000 "Change" names slice 5; there are 3.',
  ]);
  expect(sliceTips([commit('a1', 1), commit('c1', 3)], 3)).toEqual({
    ok: false,
    problems: ['Slice 2 has no commit.'],
  });
});

function fix(subject: string): StackCommit {
  return { sha: 'f', subject, body: '' };
}

test('a fixup names its target by sha, never by subject', () => {
  const stack = [{ sha: 'abc12345'.padEnd(40, '1') }, { sha: 'abc12349'.padEnd(40, '2') }];
  expect(fixupTarget(fix('Add tests'), stack)).toBeNull();
  expect(fixupTarget(fix('fixup! abc12345'), stack)).toEqual({
    kind: 'target',
    sha: 'abc12345'.padEnd(40, '1'),
  });
  expect(fixupTarget(fix('fixup! abc123'), stack)).toEqual({ kind: 'not_sha', named: 'abc123' });
  expect(fixupTarget(fix('fixup! abc1234'), stack)).toEqual({
    kind: 'ambiguous',
    named: 'abc1234',
  });
  expect(fixupTarget(fix('fixup! deadbeef'), stack)).toEqual({
    kind: 'unknown',
    named: 'deadbeef',
  });
  expect(fixupTarget(fix('fixup! Add tests'), stack)).toEqual({
    kind: 'not_sha',
    named: 'Add tests',
  });
});
