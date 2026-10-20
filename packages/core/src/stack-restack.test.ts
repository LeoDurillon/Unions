import { expect, test } from 'bun:test';

import { restackPlan, type RestackSlice } from './stack-restack';
import type { StackCommit } from './stack-trailers';

const sha = (name: string): string => name.padEnd(40, '0');

const stack: RestackSlice[] = [
  { position: 1, branch: '12-billing-s1', commits: [sha('a1')] },
  { position: 2, branch: '12-billing-s2', commits: [sha('b1'), sha('b2')] },
  { position: 3, branch: '12-billing', commits: [sha('c1')] },
];

function added(name: string, subject: string, body = ''): StackCommit {
  return { sha: sha(name), subject, body };
}

test('fixups fold into their commit and slice commits go at the end of their slice', () => {
  const plan = restackPlan(stack, [
    added('f1', `fixup! ${sha('b1').slice(0, 8)}`),
    added('d1', 'Add a missing test', 'Slice: 2'),
    added('f2', `fixup! ${sha('a1').slice(0, 8)}`),
  ]);
  expect(plan).toEqual({
    ok: true,
    todo: [
      `pick ${sha('a1')}`,
      `fixup ${sha('f2')}`,
      'update-ref refs/heads/12-billing-s1',
      `pick ${sha('b1')}`,
      `fixup ${sha('f1')}`,
      `pick ${sha('b2')}`,
      `pick ${sha('d1')}`,
      'update-ref refs/heads/12-billing-s2',
      `pick ${sha('c1')}`,
      '',
    ].join('\n'),
    changed: [1, 2],
  });
});

test('a fixup may target a commit the same revision added', () => {
  const plan = restackPlan(stack, [
    added('d1', 'Add a test', 'Slice: 3'),
    added('f1', `fixup! ${sha('d1').slice(0, 8)}`),
  ]);
  expect(plan.ok && plan.todo.endsWith(`pick ${sha('d1')}\nfixup ${sha('f1')}\n`)).toBe(true);
  expect(plan.ok ? plan.changed : []).toEqual([3]);
});

test('a commit with no slice or a fixup with no single target is refused', () => {
  const plan = restackPlan(stack, [
    added('d1', 'Tidy up'),
    added('d2', 'Later', 'Slice: 4'),
    added('f1', 'fixup! Add tests'),
    added('f2', 'fixup! 99999999'),
  ]);
  expect(plan).toEqual({
    ok: false,
    problems: [
      'd1000000 "Tidy up" names no slice of the stack: add a `Slice:` trailer.',
      'd2000000 "Later" names no slice of the stack: add a `Slice:` trailer.',
      'f1000000 "fixup! Add tests": `Add tests` is not a sha: name the commit by its sha.',
      'f2000000 "fixup! 99999999": `99999999` is not a commit of the stack.',
    ],
  });
});
