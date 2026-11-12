import { beforeEach, expect, test } from 'bun:test';

import { AgentToolError, REVIEW_AGENT_TOOLS } from '../agent/agent-tools';
import { resolveAgent, saveAgent, toolsFor } from '../agent/agents';
import {
  claimCustomAgentPrompt,
  createCustomAgent,
  CustomAgentError,
  deleteCustomAgent,
  finishCustomAgentPrompt,
  flowReadySteps,
  readyReviewAgents,
} from '../custom-agents/custom-agents';
import { createDb, migrateDb, type Db } from '../db';
import { customStep } from '../states';
import * as tables from '../tables';
import { createTicket } from '../ticket/tickets';
import { queueReviewAgentRun } from './review-agent-runs';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function ready(name: string, kind: 'step' | 'review'): number {
  const agent = createCustomAgent(db, { name, role: 'Say whether it can be merged', kind });
  claimCustomAgentPrompt(db);
  finishCustomAgentPrompt(db, agent.id, { prompt: 'Run the checks.' });
  return agent.id;
}

test('an agent is a ticket step unless created as a review agent; another kind is refused', () => {
  expect(createCustomAgent(db, { name: 'Plan check', role: 'Check' }).kind).toBe('step');
  expect(createCustomAgent(db, { name: 'Merge', role: 'Check', kind: 'review' }).kind).toBe(
    'review',
  );
  expect(() => createCustomAgent(db, { name: 'Odd', role: 'Check', kind: 'both' })).toThrow(
    CustomAgentError,
  );
});

test('a review agent runs with Bash by default and may keep it; file edits stay refused', () => {
  const step = customStep(ready('Merge', 'review'));
  expect(toolsFor(db, step)).toEqual([...REVIEW_AGENT_TOOLS]);
  expect(toolsFor(db, step)).toContain('Bash');
  expect(resolveAgent(db, step).custom?.kind).toBe('review');
  saveAgent(db, step, { prompt: 'p', model: 'sonnet', tools: ['Read', 'Bash'] });
  expect(toolsFor(db, step)).toEqual(['Read', 'Bash']);
  expect(() => saveAgent(db, step, { prompt: 'p', model: 'sonnet', tools: ['Edit'] })).toThrow(
    AgentToolError,
  );
  expect(() => saveAgent(db, step, { prompt: 'p', model: 'sonnet', tools: ['Write'] })).toThrow(
    'A review agent changes no file: remove Write',
  );
});

test('flows offer only step agents, the review page only review agents, both once ready', () => {
  const plan = ready('Plan check', 'step');
  const merge = ready('Merge', 'review');
  createCustomAgent(db, { name: 'Unwritten', role: 'Check', kind: 'review' });
  expect(flowReadySteps(db)).toEqual([customStep(plan)]);
  expect(readyReviewAgents(db).map((agent) => agent.id)).toEqual([merge]);
});

test('deleting a review agent is refused while one of its runs waits or runs', () => {
  const merge = ready('Merge', 'review');
  const projectId = db
    .insert(tables.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const ticket = createTicket(db, { projectId, title: 'T' });
  queueReviewAgentRun(db, { kind: 'ticket', id: ticket.id }, merge);
  expect(() => deleteCustomAgent(db, merge)).toThrow('Still used by its review run');
});
