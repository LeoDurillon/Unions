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

test('a result line gives the call’s tokens', () => {
  const [line] = summarizeAgentEvent({
    type: 'result',
    is_error: false,
    session_id: 's1',
    duration_ms: 132_085,
    num_turns: 10,
    usage: {
      input_tokens: 20,
      cache_creation_input_tokens: 13_712,
      cache_read_input_tokens: 3_932_530,
      output_tokens: 5687,
      output_tokens_details: { thinking_tokens: 1209 },
    },
  });
  expect(line?.text).toBe(
    'finished in 132s · 10 turns · 3.9M in (100% cached) · 5.7k out (1.2k thinking)',
  );
  expect(line?.tokens).toMatchObject({ cacheRead: 3_932_530, output: 5687, turns: 10 });
});

test("the worker's own notes show as one line", () => {
  expect(summarizeAgentEvent({ type: 'union_note', text: 'rebased with no conflict' })).toEqual([
    { kind: 'init', text: 'rebased with no conflict' },
  ]);
  expect(summarizeAgentEvent({ type: 'union_note' })).toEqual([]);
});
