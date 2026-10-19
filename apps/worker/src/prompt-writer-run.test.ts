import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createCustomAgent,
  createDb,
  customStep,
  findCustomAgent,
  migrateDb,
  resolveAgent,
  schema,
  type ContainerRuntime,
} from '@union/core';

import type { AgentFn, AgentOutcome, AgentRun } from './agent';
import { PromptWriterRunner } from './prompt-writer-run';
import type { ProvisionConfig } from './provision';
import { RunSlots } from './slots';

/** Records what the runner asks of Docker; every call succeeds. */
function fakeRuntime(calls: string[]): ContainerRuntime {
  const record =
    (name: string) =>
    (container: string): Promise<void> => {
      calls.push(`${name} ${container}`);
      return Promise.resolve();
    };
  return {
    create: (spec: { name: string }) => record('create')(spec.name),
    start: record('start'),
    remove: record('remove'),
    writeFile: record('writeFile'),
  } as unknown as ContainerRuntime;
}

async function withCredentials(body: (credentialsPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'union-prompt-writer-'));
  const credentialsPath = path.join(dir, 'credentials.json');
  await writeFile(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }));
  try {
    await body(credentialsPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runnerWith(
  credentialsPath: string,
  calls: string[],
  agent: AgentFn,
): { runner: PromptWriterRunner; db: ReturnType<typeof createDb> } {
  const db = createDb(':memory:');
  migrateDb(db);
  const runner = new PromptWriterRunner({
    db,
    runtime: fakeRuntime(calls),
    config: { image: 'img', credentialsPath } as ProvisionConfig,
    slots: new RunSlots(1),
    agent,
  });
  return { runner, db };
}

test("the writer turns the role into the agent's default prompt in a throwaway container on Sonnet", async () => {
  await withCredentials(async (credentialsPath) => {
    const calls: string[] = [];
    const runs: AgentRun[] = [];
    const { runner, db } = runnerWith(credentialsPath, calls, (_runtime, run) => {
      runs.push(run);
      const result: AgentOutcome = {
        kind: 'ok',
        sessionId: 's',
        text: '```\nCheck auth.\nOutput one section starting with `## Security`.\n```',
      };
      return Promise.resolve(result);
    });
    const agent = createCustomAgent(db, { name: 'Security', role: 'Check auth and secrets' });
    runner.tick();
    await runner.idle();
    expect(runs[0]).toMatchObject({ model: 'sonnet', tools: ['Read'] });
    expect(runs[0]?.prompt).toContain('Check auth and secrets');
    expect(calls).toContain(`create union-prompt-writer-${agent.id}`);
    expect(calls.at(-1)).toBe(`remove union-prompt-writer-${agent.id}`);
    expect(resolveAgent(db, customStep(agent.id))).toMatchObject({
      prompt: 'Check auth.\nOutput one section starting with `## Security`.',
      custom: { promptStatus: 'ready', promptError: null },
    });
    const events = db.select().from(schema.events).all();
    expect(events.map((event) => event.type)).toEqual(['custom_agent_prompt_ready']);
  });
});

test('a failed run keeps the agent without a prompt and says why', async () => {
  await withCredentials(async (credentialsPath) => {
    const { runner, db } = runnerWith(credentialsPath, [], () =>
      Promise.resolve({ kind: 'ok', sessionId: 's', text: '  ' }),
    );
    const agent = createCustomAgent(db, { name: 'Security', role: 'Check auth' });
    runner.tick();
    await runner.idle();
    expect(findCustomAgent(db, agent.id)).toMatchObject({
      promptStatus: 'failed',
      promptError: 'The prompt writer answered nothing',
      defaultPrompt: null,
    });
  });
});
