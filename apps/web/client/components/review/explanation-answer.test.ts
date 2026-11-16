// Tests finding the code an Explain answer cites.

import { expect, test } from 'bun:test';

import { citationsOf } from './explanation-answer';

test('citations name files of the change once each, with their line', () => {
  const text =
    'Calls `src/export/csv.ts:40`, then src/export/csv.ts:40 and `lib/x.ts:3`; see README.md:2.';
  expect(citationsOf(text, new Set(['src/export/csv.ts', 'README.md']))).toEqual([
    { path: 'src/export/csv.ts', line: 40 },
    { path: 'README.md', line: 2 },
  ]);
});
