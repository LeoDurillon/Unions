import { beforeEach, expect, test } from 'bun:test';

import { AgentToolError } from './agent-tools';
import { listAgents, modelFor, resolveAgent, saveAgent, toolsFor } from './agents';
import {
  claimCustomAgentPrompt,
  createCustomAgent,
  CustomAgentError,
  customAgentNames,
  deleteCustomAgent,
  finishCustomAgentPrompt,
  flowReadySteps,
  regenerateCustomAgent,
  requeueCustomAgentPrompts,
} from './custom-agents';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './schema';
import { customStep } from './states';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function readyAgent(name: string): number {
  const agent = createCustomAgent(db, { name, role: 'Check the plan for security risks' });
  claimCustomAgentPrompt(db);
  finishCustomAgentPrompt(db, agent.id, { prompt: `Check security.\nOutput "## ${name}".` });
  return agent.id;
}

function addProject(steps: string[]): void {
  db.insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'app',
      config: {
        baseBranch: 'main',
        flows: [
          { id: 'secure', name: 'Secure', steps: steps.filter((step) => step !== '') as never },
        ],
      },
    })
    .run();
}

test('a new agent waits for its prompt, then runs on Sonnet with the review tools', () => {
  const agent = createCustomAgent(db, { name: ' Security ', role: 'Look for risks' });
  expect(agent).toMatchObject({ name: 'Security', promptStatus: 'queued', defaultPrompt: null });
  expect(flowReadySteps(db)).toEqual([]);
  expect(claimCustomAgentPrompt(db)?.promptStatus).toBe('running');
  expect(claimCustomAgentPrompt(db)).toBeNull();
  finishCustomAgentPrompt(db, agent.id, { prompt: 'Check security.' });
  const step = customStep(agent.id);
  expect(flowReadySteps(db)).toEqual([step]);
  expect(resolveAgent(db, step)).toMatchObject({
    prompt: 'Check security.',
    defaultPrompt: 'Check security.',
    model: 'sonnet',
    custom: { name: 'Security', promptStatus: 'ready' },
  });
  expect(modelFor(db, step)).toBe('sonnet');
  expect(toolsFor(db, step)).toContain('Bash(git diff*)');
  expect(listAgents(db).at(-1)?.agent).toBe(step);
});

test('regenerating keeps the written prompt for flows until the new one replaces it', () => {
  const id = readyAgent('Security');
  saveAgent(db, customStep(id), { prompt: 'My own.', model: 'opus' });
  regenerateCustomAgent(db, id);
  expect(() => regenerateCustomAgent(db, id)).toThrow(CustomAgentError);
  expect(flowReadySteps(db)).toEqual([customStep(id)]);
  claimCustomAgentPrompt(db);
  expect(requeueCustomAgentPrompts(db)).toBe(1);
  claimCustomAgentPrompt(db);
  finishCustomAgentPrompt(db, id, { prompt: 'Rewritten.' });
  expect(resolveAgent(db, customStep(id))).toMatchObject({
    prompt: 'My own.',
    defaultPrompt: 'Rewritten.',
  });
});

test('a custom agent may not have the tools that write files', () => {
  const step = customStep(readyAgent('Security'));
  expect(() =>
    saveAgent(db, step, { prompt: 'p', model: 'sonnet', tools: ['Read', 'Edit'] }),
  ).toThrow(AgentToolError);
  expect(() => saveAgent(db, step, { prompt: 'p', model: 'sonnet', tools: ['Bash'] })).toThrow(
    'remove Bash',
  );
  saveAgent(db, step, { prompt: 'p', model: 'sonnet', tools: ['Read', 'WebSearch'] });
  expect(toolsFor(db, step)).toEqual(['Read', 'WebSearch']);
});

test('names are unique among live agents', () => {
  readyAgent('Security');
  expect(() => createCustomAgent(db, { name: 'security', role: 'Again' })).toThrow('already named');
});

test('deleting is refused while a flow or an unfinished ticket runs the agent, then soft', () => {
  const id = readyAgent('Security');
  const step = customStep(id);
  addProject([step, 'implement', 'final_review']);
  expect(() => deleteCustomAgent(db, id)).toThrow('the Secure flow of acme/app');
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main' } })
    .run();
  const project = db.select().from(schema.projects).get();
  db.insert(schema.tickets)
    .values({
      projectId: project?.id ?? 0,
      title: 't',
      body: '',
      flow: [step, 'implement', 'final_review'],
    })
    .run();
  expect(() => deleteCustomAgent(db, id)).toThrow('ticket #1');
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .run();
  deleteCustomAgent(db, id);
  expect(listAgents(db).some((agent) => agent.agent === step)).toBe(false);
  expect(flowReadySteps(db)).toEqual([]);
  expect(customAgentNames(db)).toEqual({ [step]: 'Security' });
});
