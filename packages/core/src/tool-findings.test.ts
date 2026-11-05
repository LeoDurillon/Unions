// Tests the findings read from the tool uses: large outputs, check forms, files read again, refusals and skills.
import { expect, test } from 'bun:test';

import { toolFindings, type ToolRecord } from './tool-findings';

function bash(ticketId: number, target: string, fields: Partial<ToolRecord> = {}): ToolRecord {
  return {
    ticketId,
    tool: 'Bash',
    target,
    variant: target,
    subagent: false,
    calls: 1,
    denied: 0,
    resultBytes: 0,
    ...fields,
  };
}

function forms(target: string): ToolRecord[] {
  return [1, 2, 3, 4, 5, 6].map((at) => bash(1, target, { variant: `${target} --flag${at}` }));
}

function read(ticketId: number, target: string): ToolRecord {
  return { ...bash(ticketId, target), tool: 'Read' };
}

function kinds(records: ToolRecord[]): string[] {
  return toolFindings(records).map((found) => found.kind);
}

test('a command printing a lot each time is a large output, not code read piece by piece', () => {
  expect(kinds([bash(1, 'git diff', { calls: 20, resultBytes: 300_000 })])).toEqual([
    'large_outputs',
  ]);
  expect(kinds([bash(1, 'cat', { calls: 200, resultBytes: 300_000 })])).toEqual([]);
  expect(kinds([bash(1, 'git diff', { calls: 20, resultBytes: 300_000, subagent: true })])).toEqual(
    [],
  );
});

test('a check run in more than five forms is named, git commands are not checks', () => {
  expect(toolFindings(forms('jest'))[0]).toMatchObject({
    kind: 'check_variants',
    items: [{ label: 'jest', value: 6, calls: 6 }],
  });
  expect(kinds(forms('git checkout'))).toEqual([]);
});

test('a file read in three tickets is named; Union’s own files are not', () => {
  const found = toolFindings(
    [1, 2, 3].flatMap((id) => [read(id, 'src/a.ts'), read(id, '.git/union-review-hunks.md')]),
  );
  expect(found).toEqual([
    {
      kind: 'repeated_reads',
      actor: 'repository',
      items: [{ label: 'src/a.ts', value: 3, calls: 3, tickets: [1, 2, 3] }],
    },
  ]);
});

test('refusals show from more than ten, skills from more than ten loads', () => {
  expect(kinds([bash(1, 'gh', { denied: 10 })])).toEqual([]);
  expect(kinds([bash(1, 'gh', { denied: 6 }), bash(2, 'curl', { denied: 5 })])).toEqual(['denied']);
  const skill = { ...bash(1, 'gitmoji-commit', { calls: 11 }), tool: 'Skill' };
  expect(kinds([skill])).toEqual(['repeated_skills']);
});
