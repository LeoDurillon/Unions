// Tests of usage-limit detection: the CLI's wordings, its rejected report, and the reset time a run is retried at.
import { expect, test } from 'bun:test';

import type { ContainerRuntime, ExecResult } from '@union/core';

import { runAgent, type AgentOutcome } from './agent';
import { rejectedResetAt, resetFromMessage } from './rate-limit';

/** 2026-11-08 15:00 UTC. */
const NOW = Date.UTC(2026, 10, 8, 15, 0);
const RESET_SECONDS = 1_793_643_600;

function limitEvent(status: string): unknown {
  return {
    type: 'rate_limit_event',
    rate_limit_info: {
      status,
      resetsAt: RESET_SECONDS,
      rateLimitType: 'five_hour',
      unifiedWindows: { five_hour: { utilization: 1, resetsAt: RESET_SECONDS } },
    },
  };
}

function failed(message: string): unknown {
  return { type: 'result', result: message, session_id: 's', is_error: true };
}

/** `claude` prints `lines` and exits. */
function runtimePrinting(lines: unknown[], exit: ExecResult | undefined): ContainerRuntime {
  return {
    async *exec(_name: string, command: string[]) {
      await Promise.resolve();
      if (command[0] === 'claude') {
        yield* lines.map((line) => JSON.stringify(line));
        return exit ?? { exitCode: 1, stderr: '' };
      }
      return { exitCode: 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
}

function outcomeOf(lines: unknown[], exit?: ExecResult): Promise<AgentOutcome> {
  return runAgent(runtimePrinting(lines, exit), {
    container: 'union-t9001',
    cwd: '/workspace',
    model: 'sonnet',
    prompt: 'go',
    tools: [],
    onEvent: () => {},
    idleGraceMs: 1,
  });
}

test("the CLI's current message is a usage limit, with its reset read from the text", async () => {
  for (const message of [
    "You've hit your session limit · resets 6:20pm (UTC)",
    "You've hit your session limit · resets 11:20am (UTC)",
    "You've hit your weekly limit",
    'Claude AI usage limit reached|1793643600',
  ]) {
    const outcome = await outcomeOf([failed(message)]);
    expect(outcome.kind).toBe('rate_limited');
  }
  const outcome = await outcomeOf([failed("You've hit your session limit · resets 6:20pm (UTC)")]);
  expect(outcome).toMatchObject({ kind: 'rate_limited' });
  const resetsAt = outcome.kind === 'rate_limited' ? outcome.resetsAt : null;
  expect(new Date(resetsAt ?? 0).getUTCHours()).toBe(18);
  expect(new Date(resetsAt ?? 0).getUTCMinutes()).toBe(20);
});

test('a rejected limit report makes any failure a usage limit, reset at its time', async () => {
  expect(await outcomeOf([limitEvent('rejected'), failed('API Error')])).toEqual({
    kind: 'rate_limited',
    message: 'API Error',
    resetsAt: RESET_SECONDS * 1000,
  });
  expect(await outcomeOf([limitEvent('rejected')], { exitCode: 1, stderr: 'boom' })).toMatchObject({
    kind: 'rate_limited',
    resetsAt: RESET_SECONDS * 1000,
  });
});

test('other failures stay errors, an allowed report and a limit mentioned in code included', async () => {
  expect(await outcomeOf([limitEvent('allowed_warning'), failed('API Error')])).toMatchObject({
    kind: 'error',
  });
  expect(await outcomeOf([failed('TypeError: maxLength is not a function')])).toMatchObject({
    kind: 'error',
  });
});

test('only a rejected report gives a reset time', () => {
  expect(rejectedResetAt(limitEvent('rejected'))).toBe(RESET_SECONDS * 1000);
  expect(rejectedResetAt(limitEvent('allowed'))).toBeNull();
  expect(rejectedResetAt({ type: 'result' })).toBeNull();
});

test('the reset named in a message is the next one, across midnight', () => {
  expect(resetFromMessage('resets 6:20pm (UTC)', NOW)).toBe(Date.UTC(2026, 10, 8, 18, 20));
  // 11:20am has passed at 15:00: tomorrow's.
  expect(resetFromMessage('resets 11:20am (UTC)', NOW)).toBe(Date.UTC(2026, 10, 9, 11, 20));
  expect(resetFromMessage('resets 12am (UTC)', NOW)).toBe(Date.UTC(2026, 10, 9, 0, 0));
  expect(resetFromMessage('resets 12:05pm (UTC)', NOW)).toBe(Date.UTC(2026, 10, 9, 12, 5));
  // Another zone's offset is not known here.
  expect(resetFromMessage('resets 6:20pm (Europe/Paris)', NOW)).toBeNull();
  expect(resetFromMessage('limit reached', NOW)).toBeNull();
});
