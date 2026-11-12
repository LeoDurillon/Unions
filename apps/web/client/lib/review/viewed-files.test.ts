import { expect, test } from 'bun:test';

import { toggledViewed, viewedCount, viewedKey } from './viewed-files';

const FILE = { path: 'src/a.ts', additions: 3, deletions: 1 };

test('a mark toggles, and counts only the files at the size they were marked', () => {
  const marked = toggledViewed(new Set(), FILE);
  expect(marked.has(viewedKey(FILE))).toBe(true);
  expect(viewedCount([FILE, { path: 'src/b.ts', additions: 1, deletions: 0 }], marked)).toBe(1);
  expect(viewedCount([{ ...FILE, additions: 4 }], marked)).toBe(0);
  expect(toggledViewed(marked, FILE).size).toBe(0);
});
