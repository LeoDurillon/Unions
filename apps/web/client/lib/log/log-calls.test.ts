import { expect, test } from 'bun:test';

import type { ToolCallPart } from './agent-events';
import { pairCalls } from './log-calls';

type Line = { kind: string; text: string; call?: ToolCallPart };

test('a result joins its call and its own line goes', () => {
  const lines: Line[] = [
    { kind: 'tool', text: 'Bash ls', call: { id: 'a', input: '{}' } },
    { kind: 'text', text: 'Reading' },
    { kind: 'error', text: 'tool failed', call: { id: 'a', output: 'No such file', failed: true } },
  ];
  expect(pairCalls(lines)).toEqual([
    {
      kind: 'tool',
      text: 'Bash ls',
      call: { id: 'a', input: '{}', output: 'No such file', failed: true },
    },
    { kind: 'text', text: 'Reading' },
  ]);
});

test('a result without its call, and a call still waiting, stay as they are', () => {
  const lines: Line[] = [
    { kind: 'tool_result', text: 'tool result', call: { id: 'gone', output: 'x' } },
    { kind: 'tool', text: 'Read a.ts', call: { id: 'b', input: '{}' } },
  ];
  expect(pairCalls(lines)).toEqual(lines);
});
