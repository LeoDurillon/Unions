import { expect, test } from 'bun:test';

import { lineDiff } from './line-diff';

test('kept lines stay, changed ones read as removed then added', () => {
  expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
    { kind: 'same', text: 'a' },
    { kind: 'removed', text: 'b' },
    { kind: 'added', text: 'B' },
    { kind: 'same', text: 'c' },
    { kind: 'added', text: 'd' },
  ]);
});

test('an empty side is all added or all removed', () => {
  expect(lineDiff('', 'x')).toEqual([{ kind: 'added', text: 'x' }]);
  expect(lineDiff('x', '')).toEqual([{ kind: 'removed', text: 'x' }]);
  expect(lineDiff('', '')).toEqual([]);
});
