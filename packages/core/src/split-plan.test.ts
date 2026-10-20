import { expect, test } from 'bun:test';

import { parseSplitPlan } from './split-plan';

const plan = `Some preamble the agent wrote.

## Slice 1: Database migration

**Spec:** The invoices table
and its indexes.

**Changes:** \`db/0012.sql\`

**Stands alone:** nothing reads it yet.

## Slice 2: CRUD

**Spec:** Create and list invoices.

## Notes

Not a slice.
`;

test('a plan is read slice by slice, the spec up to the next field', () => {
  expect(parseSplitPlan(plan)).toEqual({
    ok: true,
    slices: [
      { position: 1, title: 'Database migration', spec: 'The invoices table\nand its indexes.' },
      { position: 2, title: 'CRUD', spec: 'Create and list invoices.' },
    ],
  });
});

test('a plan with one slice, gaps in the numbers, or a slice without spec is refused', () => {
  expect(parseSplitPlan('## Slice 1: All\n\n**Spec:** x').ok).toBe(false);
  const broken = parseSplitPlan('## Slice 1: A\n\n**Spec:** a\n\n## Slice 3:\n\n**Changes:** b');
  expect(broken).toEqual({
    ok: false,
    problems: [
      'Slice 3 comes where slice 2 was expected.',
      'Slice 3 has no title.',
      'Slice 3 has no `**Spec:**` paragraph.',
    ],
  });
});
