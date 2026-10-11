import { expect, test } from 'bun:test';

import { summarizeAgentEvent } from './agent-events';

test('init, text, tool use and results become short lines', () => {
  expect(summarizeAgentEvent({ type: 'system', subtype: 'init', model: 'haiku' })).toEqual([
    { kind: 'init', text: 'session started · haiku' },
  ]);
  expect(
    summarizeAgentEvent({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Reading the repo' },
          { type: 'tool_use', name: 'Read', input: { file_path: 'src/todos.ts' } },
          { type: 'thinking', thinking: 'hidden' },
        ],
      },
    }),
  ).toEqual([
    { kind: 'text', text: 'Reading the repo' },
    { kind: 'tool', text: 'Read src/todos.ts' },
  ]);
  expect(
    summarizeAgentEvent({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: 'big' }] },
    }),
  ).toEqual([{ kind: 'tool_result', text: 'tool result' }]);
  expect(summarizeAgentEvent({ type: 'result', is_error: false, duration_ms: 4200 })).toEqual([
    { kind: 'result', text: 'finished in 4s' },
  ]);
});

test('errors are flagged and long text is clipped', () => {
  expect(summarizeAgentEvent({ type: 'result', is_error: true, result: 'boom' })[0]).toEqual({
    kind: 'error',
    text: 'failed: boom',
  });
  const [line] = summarizeAgentEvent({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'x'.repeat(2000) }] },
  });
  expect(line?.text.length).toBeLessThan(700);
});

test('unknown or malformed payloads yield nothing', () => {
  expect(summarizeAgentEvent(null)).toEqual([]);
  expect(summarizeAgentEvent({ type: 'rate_limit_event' })).toEqual([]);
  expect(summarizeAgentEvent({ type: 'assistant', message: 'oops' })).toEqual([]);
});
