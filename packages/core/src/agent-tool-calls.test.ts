// Tests counting a call's tool uses: results, errors, refusals and subagents' calls apart.
import { expect, test } from 'bun:test';

import { countToolCalls } from './agent-tool-calls';

function use(id: string, name: string, input: unknown, parent: string | null = null): unknown {
  return {
    type: 'assistant',
    parent_tool_use_id: parent,
    message: { content: [{ type: 'tool_use', id, name, input }] },
  };
}

function result(id: string, content: unknown, isError = false): unknown {
  return {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  };
}

test('uses of a key add up, with the size of their results and their errors', () => {
  const counts = countToolCalls([
    use('a', 'Bash', { command: 'git diff main...HEAD' }),
    result('a', 'x'.repeat(100)),
    use('b', 'Bash', { command: 'git diff main...HEAD' }),
    result('b', [{ type: 'text', text: 'boom' }], true),
    use('c', 'Read', { file_path: '/workspace/repo/a.png' }),
    result('c', [{ type: 'image', source: { data: 'x'.repeat(1000) } }]),
  ]);
  expect(counts).toEqual([
    {
      tool: 'Bash',
      target: 'git diff',
      variant: 'git diff',
      subagent: false,
      calls: 2,
      errors: 1,
      denied: 0,
      resultBytes: 104,
    },
    {
      tool: 'Read',
      target: 'a.png',
      variant: '',
      subagent: false,
      calls: 1,
      errors: 0,
      denied: 0,
      resultBytes: 0,
    },
  ]);
});

test('a refusal counts on its use, and a subagent’s uses apart', () => {
  const counts = countToolCalls([
    use('a', 'Bash', { command: 'gh pr view 1' }),
    { type: 'system', subtype: 'permission_denied', tool_use_id: 'a' },
    result('a', 'denied', true),
    use('b', 'Bash', { command: 'gh pr view 2' }, 'task-1'),
  ]);
  expect(counts.map((count) => [count.subagent, count.calls, count.denied])).toEqual([
    [false, 1, 1],
    [true, 1, 0],
  ]);
});
