import { describe, expect, test } from 'bun:test';

import { changeBudget, describeSize, isOverBudget, parseSizeEstimate } from './change-budget';
import { DEFAULT_SIZE_IGNORE, measureChange, parseNumstat, type ChangeSize } from './change-size';

describe('measureChange', () => {
  test('counts code apart from tests, generated files and docs; binary files count nowhere', () => {
    const size = measureChange(
      [
        { path: 'src/a.ts', additions: 100, deletions: 20 },
        { path: 'src/b.ts', additions: 5, deletions: 0 },
        { path: 'src/a.test.ts', additions: 300, deletions: 0 },
        { path: 'app/tests/flow.py', additions: 40, deletions: 0 },
        { path: 'bun.lock', additions: 900, deletions: 0 },
        { path: 'db/migrations/0001.sql', additions: 30, deletions: 0 },
        { path: 'docs/guide.md', additions: 12, deletions: 3 },
        { path: 'logo.png', additions: 0, deletions: 0, binary: true },
      ],
      DEFAULT_SIZE_IGNORE,
    );
    expect(size).toEqual({
      code: 105,
      removed: 20,
      tests: 340,
      other: 942,
      codeFiles: [
        { path: 'src/a.ts', additions: 100 },
        { path: 'src/b.ts', additions: 5 },
      ],
    });
  });

  test("the project's patterns replace the defaults", () => {
    const files = [
      { path: 'docs/guide.md', additions: 12, deletions: 0 },
      { path: 'gen/api.ts', additions: 500, deletions: 0 },
    ];
    expect(measureChange(files, ['gen/']).code).toBe(12);
  });
});

test('parseNumstat reads NUL-ended records, binary files and paths with tabs', () => {
  expect(
    parseNumstat('3\t1\tsrc/a.ts\u0000-\t-\tlogo.png\u00002\t0\tweird\tname.ts\u0000'),
  ).toEqual([
    { path: 'src/a.ts', additions: 3, deletions: 1, binary: false },
    { path: 'logo.png', additions: 0, deletions: 0, binary: true },
    { path: 'weird\tname.ts', additions: 2, deletions: 0, binary: false },
  ]);
});

function sized(code: number): ChangeSize {
  return { code, removed: 0, tests: 0, other: 0, codeFiles: [] };
}

describe('the budget', () => {
  test('the last estimate line of the plan wins, in any case, with separators', () => {
    expect(
      parseSizeEstimate('Estimated size: 80 lines\n…\n**Estimated size:** ~1,200 lines of code'),
    ).toBe(1200);
    expect(parseSizeEstimate('estimated size: 45 lines')).toBe(45);
    expect(parseSizeEstimate('No estimate here')).toBeNull();
  });

  test('the estimate comes before the project default; neither: no budget', () => {
    const plan = 'Estimated size: 150 lines of code';
    expect(changeBudget(plan, { sizeBudget: 400 })).toEqual({ lines: 150, source: 'estimate' });
    expect(changeBudget('none', { sizeBudget: 400 })).toEqual({ lines: 400, source: 'project' });
    expect(changeBudget(null, {})).toBeNull();
  });

  test('over budget only beyond the tolerance', () => {
    const budget = { lines: 100, source: 'estimate' } as const;
    expect(isOverBudget(sized(150), budget)).toBe(false);
    expect(isOverBudget(sized(151), budget)).toBe(true);
    expect(isOverBudget(sized(9999), null)).toBe(false);
    expect(describeSize({ ...sized(312), tests: 840, removed: 41 }, budget)).toBe(
      '312 lines of code (+840 tests), 41 removed, for ~100 estimated',
    );
  });
});
