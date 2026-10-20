import { expect, test } from 'bun:test';

import type { ContainerRuntime } from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { settlePlan } from './split-plan-step';

const runtime = {} as ContainerRuntime;
const run: AgentRun = {
  container: 'c',
  cwd: '/workspace/repo',
  model: 'opus',
  prompt: 'Plan it',
  tools: [],
  onEvent: () => {
    // not checked
  },
};
const good = '## Slice 1: A\n\n**Spec:** a\n\n## Slice 2: B\n\n**Spec:** b\n';

function answering(text: string, seen: AgentRun[]): AgentFn {
  return (_runtime, agentRun) => {
    seen.push(agentRun);
    return Promise.resolve({ kind: 'ok', text, sessionId: 's2' });
  };
}

test('a readable plan is the output as the agent wrote it', async () => {
  const seen: AgentRun[] = [];
  const outcome = { kind: 'ok', text: good, sessionId: 's1' } as const;
  expect(await settlePlan(answering(good, seen), runtime, run, outcome)).toEqual({
    kind: 'ok',
    output: good,
    sessionId: 's1',
  });
  expect(seen).toHaveLength(0);
});

test('an unreadable plan gets one more turn in its session, with what is wrong', async () => {
  const seen: AgentRun[] = [];
  const outcome = { kind: 'ok', text: 'One big slice.', sessionId: 's1' } as const;
  const result = await settlePlan(answering(good, seen), runtime, run, outcome);
  expect(result).toEqual({ kind: 'ok', output: good, sessionId: 's2' });
  expect(seen[0]?.resumeSessionId).toBe('s1');
  expect(seen[0]?.prompt).toContain('at least 2 `## Slice <n>: <title>` sections');
});

test('still unreadable after the second turn: the step fails with the problems', async () => {
  const outcome = { kind: 'ok', text: 'One big slice.', sessionId: 's1' } as const;
  const result = await settlePlan(answering('Still one.', []), runtime, run, outcome);
  expect(result.kind === 'error' && result.error).toContain('The plan cannot be read');
});
