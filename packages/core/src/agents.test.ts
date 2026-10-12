import { beforeEach, expect, test } from 'bun:test';

import {
  AGENT_IDS,
  DEFAULT_PROMPTS,
  listAgents,
  modelFor,
  resetAgent,
  resolveAgent,
  effortFor,
  saveAgent,
  sharedPrompt,
} from './agents';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './schema';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

test('without edits every agent uses the built-in prompt and model', () => {
  const agents = listAgents(db);
  expect(agents.map((agent) => agent.agent)).toEqual([...AGENT_IDS]);
  expect(resolveAgent(db, 'intake')).toEqual({
    agent: 'intake',
    model: 'haiku',
    effort: null,
    prompt: DEFAULT_PROMPTS.intake,
    defaultModel: 'haiku',
    defaultPrompt: DEFAULT_PROMPTS.intake,
    tools: ['Read', 'Grep', 'Glob'],
    defaultTools: ['Read', 'Grep', 'Glob'],
    customized: false,
  });
  expect(resolveAgent(db, 'shared').model).toBeNull();
  expect(resolveAgent(db, 'shared').tools).toBeNull();
  expect(modelFor(db, 'technical')).toBe('opus');
  expect(modelFor(db, 'implement')).toBe('opus');
});

test('implement and final review are configurable before those steps run', () => {
  expect(resolveAgent(db, 'final_review')).toMatchObject({ model: 'opus', customized: false });
  expect(resolveAgent(db, 'final_review').prompt).toContain('VERDICT: APPROVED');
  saveAgent(db, 'implement', { prompt: 'Small commits.', model: 'sonnet' });
  expect(modelFor(db, 'implement')).toBe('sonnet');
});

test('saving overrides prompt and model; saving again updates; reset restores defaults', () => {
  saveAgent(db, 'intake', { prompt: 'Ask fewer questions.', model: 'sonnet' });
  expect(resolveAgent(db, 'intake')).toMatchObject({
    prompt: 'Ask fewer questions.',
    model: 'sonnet',
    customized: true,
  });
  expect(modelFor(db, 'intake')).toBe('sonnet');

  saveAgent(db, 'intake', { prompt: 'Ask none.', model: 'opus' });
  expect(resolveAgent(db, 'intake')).toMatchObject({ prompt: 'Ask none.', model: 'opus' });

  expect(resetAgent(db, 'intake')).toMatchObject({ model: 'haiku', customized: false });
  expect(modelFor(db, 'intake')).toBe('haiku');
});

test('the shared prompt never stores a model', () => {
  saveAgent(db, 'shared', { prompt: 'Be terse.', model: 'opus' });
  expect(resolveAgent(db, 'shared')).toMatchObject({
    prompt: 'Be terse.',
    model: null,
    customized: true,
  });
});

test('a stored model outside the list falls back to the default', () => {
  db.insert(schema.agentConfigs).values({ agent: 'summary', model: 'gpt-9', prompt: 'p' }).run();
  expect(resolveAgent(db, 'summary')).toMatchObject({
    model: 'sonnet',
    prompt: 'p',
    customized: true,
  });
});

test('the rebase prompt has no model of its own and never stores one', () => {
  expect(resolveAgent(db, 'rebase')).toMatchObject({
    model: null,
    defaultModel: null,
    customized: false,
  });
  expect(resolveAgent(db, 'rebase').prompt).toContain('git rebase --abort');
  saveAgent(db, 'rebase', { prompt: 'Prefer our side.', model: 'haiku' });
  expect(resolveAgent(db, 'rebase')).toMatchObject({
    prompt: 'Prefer our side.',
    model: null,
    customized: true,
  });
});

test('the shared prompt is followed by the project instructions when the project has some', () => {
  const insert = (repo: string, instructions?: string): number =>
    db
      .insert(schema.projects)
      .values({ owner: 'o', repo, config: { baseBranch: 'main', instructions } })
      .returning()
      .get().id;
  saveAgent(db, 'shared', { prompt: 'Be brief.', model: null });
  expect(sharedPrompt(db, insert('plain'))).toBe('Be brief.');
  expect(sharedPrompt(db, insert('blank', '  '))).toBe('Be brief.');
  expect(sharedPrompt(db, insert('own', 'Use pnpm.'))).toBe(
    'Be brief.\n\n# Project instructions\n\nUse pnpm.',
  );
});

test("an effort is saved per agent with a model; the rebase uses the implementer's", () => {
  expect(effortFor(db, 'implement')).toBeNull();
  saveAgent(db, 'implement', { prompt: DEFAULT_PROMPTS.implement, model: 'opus', effort: 'xhigh' });
  saveAgent(db, 'shared', { prompt: 'Be brief.', model: null, effort: 'max' });
  expect(effortFor(db, 'implement')).toBe('xhigh');
  expect(effortFor(db, 'rebase')).toBe('xhigh');
  expect(effortFor(db, 'intake')).toBeNull();
  // Agents without a model of their own never keep an effort.
  expect(resolveAgent(db, 'shared').effort).toBeNull();
  // A stored value outside the list (edited by hand) reads as the default.
  db.update(schema.agentConfigs)
    .set({ effort: 'huge' as never })
    .run();
  expect(effortFor(db, 'implement')).toBeNull();
});
