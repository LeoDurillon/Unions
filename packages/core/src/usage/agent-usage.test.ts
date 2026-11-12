// Tests reading a call's usage: the result's cumulative figures, the call's share, and its peak context.
import { expect, test } from 'bun:test';

import { callUsage, parseResult, parseTurn, peakOf, type CallResult } from './agent-usage';

const OPUS = 'claude-opus-5-5';
const HAIKU = 'claude-haiku-5-5';

/** A `result` event shaped like the CLI's (fields Union does not read left out). */
function result(models: Record<string, [number, number, number]>, cost = 0): unknown {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 's1',
    num_turns: 10,
    duration_ms: 132_085,
    duration_api_ms: 150_000,
    total_cost_usd: cost,
    usage: {
      input_tokens: 20,
      cache_creation_input_tokens: 13_712,
      cache_read_input_tokens: 3_932_530,
      output_tokens: 5687,
      output_tokens_details: { thinking_tokens: 1209 },
      server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
    },
    modelUsage: Object.fromEntries(
      Object.entries(models).map(([model, [cacheRead, output, costUSD]]) => [
        model,
        {
          inputTokens: 10,
          outputTokens: output,
          thinkingTokens: 0,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: 100,
          webSearchRequests: 0,
          costUSD,
          contextWindow: 1_000_000,
        },
      ]),
    ),
  };
}

function parsed(payload: unknown): CallResult {
  const value = parseResult(payload);
  if (!value) {
    throw new Error('not a result');
  }
  return value;
}

test('a result gives the session totals per model and the call’s own usage', () => {
  const value = parsed(result({ [OPUS]: [500, 50, 1.5] }));
  expect(value.sessionId).toBe('s1');
  expect(value.turns).toBe(10);
  expect(value.models[OPUS]).toMatchObject({ cacheRead: 500, output: 50, costUsd: 1.5 });
  expect(value.call).toMatchObject({ input: 20, cacheWrite: 13_712, output: 5687, thinking: 1209 });
  expect(parseResult({ type: 'assistant' })).toBeNull();
});

test('a first call counts the whole cumulative figures', () => {
  const usages = callUsage(parsed(result({ [OPUS]: [500, 50, 1.5] })), null, OPUS);
  expect(usages).toMatchObject([
    { model: OPUS, main: true, tokens: { cacheRead: 500, output: 50, costUsd: 1.5 } },
  ]);
});

test('a resumed session counts only what this call added', () => {
  const previous = parsed(result({ [OPUS]: [500, 50, 1.5], [HAIKU]: [30, 3, 0.01] }));
  const current = parsed(result({ [OPUS]: [800, 70, 2], [HAIKU]: [30, 3, 0.01] }));
  const usages = callUsage(current, previous, OPUS);
  expect(usages).toHaveLength(1);
  expect(usages[0]?.tokens).toMatchObject({ input: 0, cacheRead: 300, cacheWrite: 0, output: 20 });
  expect(usages[0]?.tokens.costUsd).toBeCloseTo(0.5);
});

test('a subagent model gets its own row, not the main one', () => {
  const usages = callUsage(
    parsed(result({ [OPUS]: [500, 50, 1], [HAIKU]: [30, 3, 0.01] })),
    null,
    OPUS,
  );
  expect(usages.map((usage) => [usage.model, usage.main])).toEqual([
    [OPUS, true],
    [HAIKU, false],
  ]);
});

test('totals that went down fall back to the call’s own usage for the main model', () => {
  const previous = parsed(result({ [OPUS]: [900, 90, 3] }));
  const usages = callUsage(parsed(result({ [OPUS]: [500, 50, 1] })), previous, OPUS);
  expect(usages[0]?.tokens).toMatchObject({ cacheRead: 3_932_530, output: 5687, costUsd: null });
});

test('without its turns, the main model is the one with the most output', () => {
  const usages = callUsage(
    parsed(result({ [HAIKU]: [30, 3, 0], [OPUS]: [500, 50, 1] })),
    null,
    null,
  );
  expect(usages.find((usage) => usage.main)?.model).toBe(OPUS);
});

test('a result without modelUsage still records the call’s usage', () => {
  const payload = { ...(result({}) as Record<string, unknown>), modelUsage: undefined };
  expect(callUsage(parsed(payload), null, OPUS)).toMatchObject([
    { model: OPUS, main: true, tokens: { output: 5687 } },
  ]);
});

function assistant(id: string, context: number, parent: string | null = null): unknown {
  return {
    type: 'assistant',
    session_id: 's1',
    parent_tool_use_id: parent,
    message: {
      id,
      model: OPUS,
      usage: { input_tokens: 2, cache_read_input_tokens: context, cache_creation_input_tokens: 8 },
    },
  };
}

test('the peak context counts each message once and skips subagents', () => {
  const turns = [
    assistant('m1', 100),
    assistant('m1', 100),
    assistant('m2', 400),
    assistant('m3', 9000, 'toolu_1'),
  ]
    .map((event) => parseTurn(event))
    .filter((turn) => turn !== null);
  expect(turns).toHaveLength(3);
  expect(peakOf(turns)).toEqual({ peak: 410, model: OPUS });
  expect(peakOf([])).toEqual({ peak: null, model: null });
});

test('a call that failed before its first turn gets an empty row', () => {
  const payload = {
    ...(result({ [OPUS]: [500, 50, 1] }) as Record<string, unknown>),
    is_error: true,
  };
  const previous = parsed(result({ [OPUS]: [500, 50, 1] }));
  const usages = callUsage(parsed(payload), previous, null);
  expect(usages).toMatchObject([{ model: OPUS, main: true, tokens: { output: 0, costUsd: 0 } }]);
});

test('the CLI’s own messages are not turns', () => {
  const event = assistant('m1', 100) as { message: Record<string, unknown> };
  expect(parseTurn({ ...event, message: { ...event.message, model: '<synthetic>' } })).toBeNull();
});
