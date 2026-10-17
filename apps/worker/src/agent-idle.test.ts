import { expect, test } from 'bun:test';

import type { ContainerRuntime, ExecOptions, ExecResult } from '@union/core';

import { runAgent } from './agent';
import { idleTracker, RUN_MARKER } from './agent-idle';

const result = { type: 'result', result: 'Done.', session_id: 's', is_error: false };
const started = (id: string): unknown => ({ type: 'system', subtype: 'task_started', task_id: id });
const notified = (id: string): unknown => ({
  type: 'system',
  subtype: 'task_notification',
  task_id: id,
  status: 'completed',
});

function trackerAfter(events: unknown[]): boolean {
  const tracker = idleTracker();
  for (const event of events) {
    tracker.observe(event);
  }
  return tracker.idle();
}

test('the agent is idle once its turn ended and every background task reported back', () => {
  expect(trackerAfter([started('a'), notified('a'), result])).toBe(true);
  // A task finishing after the result can start another turn.
  expect(trackerAfter([started('a'), result])).toBe(false);
  expect(trackerAfter([started('a'), result, notified('a')])).toBe(false);
  expect(trackerAfter([started('a'), result, notified('a'), { type: 'assistant' }, result])).toBe(
    true,
  );
  expect(trackerAfter([{ type: 'assistant' }])).toBe(false);
});

type Call = { command: string[]; env: Record<string, string> };

/** `claude` prints its result and stays up until a TERM is sent to its marker. */
function hangingRuntime(calls: Call[]): ContainerRuntime {
  const { promise: killed, resolve: release } = Promise.withResolvers<null>();
  return {
    async *exec(_name: string, command: string[], options?: ExecOptions) {
      const env = options?.env ?? {};
      calls.push({ command, env });
      if (command[0] === 'claude') {
        yield JSON.stringify(result);
        await killed;
        return { exitCode: 143, stderr: '' };
      }
      const marker = calls.find((call) => call.command[0] === 'claude')?.env[RUN_MARKER];
      if (command.includes('TERM') && command.at(-1) === `${RUN_MARKER}=${marker}`) {
        release(null);
      }
      yield* [];
      return { exitCode: 0, stderr: '' } satisfies ExecResult;
    },
  } as unknown as ContainerRuntime;
}

test('a process that stays up after its last result is stopped and its result used', async () => {
  const calls: Call[] = [];
  const logged: unknown[] = [];
  const outcome = await runAgent(hangingRuntime(calls), {
    container: 'union-t1',
    cwd: '/workspace/repo',
    model: 'opus',
    prompt: 'Go.',
    tools: ['Read'],
    onEvent: (event) => {
      logged.push(event);
    },
    idleGraceMs: 10,
  });
  expect(outcome).toEqual({ kind: 'ok', text: 'Done.', sessionId: 's' });
  expect(logged).toContainEqual({ type: 'union_agent_idle_stopped', idleMs: 10 });
  expect(calls.map((call) => call.command[0])).toEqual(['claude', 'sh']);
});
