import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import {
  cancelQueuedInvestigation,
  claimInvestigation,
  createInvestigation,
  deleteInvestigation,
  failInterruptedInvestigations,
  finishInvestigation,
  getInvestigation,
  INVESTIGATION_DEFAULTS,
  InvestigationError,
  listInvestigations,
  rerunInvestigation,
  type NewInvestigation,
} from './investigations';
import * as schema from './schema';

let db: Db;
let input: NewInvestigation;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  input = {
    projectId: project.id,
    title: ' Why is login slow? ',
    prompt: 'Find the slow query',
    scope: 'repository',
    model: 'sonnet',
    tools: ['WebFetch', 'Read'],
  };
});

function eventTypes(id: number): string[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.investigationId === id)
    .map((event) => event.type);
}

test('creates a queued investigation with trimmed text and tools in list order', () => {
  const created = createInvestigation(db, input);
  expect(created).toMatchObject({
    title: 'Why is login slow?',
    status: 'queued',
    scope: 'repository',
    tools: ['Read', 'WebFetch'],
  });
  expect(eventTypes(created.id)).toEqual(['investigation_queued']);
  expect(INVESTIGATION_DEFAULTS.tools).toContain('WebSearch');
});

test('refuses an empty prompt, an unknown model and unknown tools', () => {
  expect(() => createInvestigation(db, { ...input, prompt: '  ' })).toThrow(InvestigationError);
  expect(() => createInvestigation(db, { ...input, model: 'gpt' })).toThrow(InvestigationError);
  expect(() => createInvestigation(db, { ...input, tools: ['Nope'] })).toThrow('Unknown tools');
  expect(listInvestigations(db, input.projectId)).toEqual([]);
});

test('claims the oldest queued one once, then finishes it', () => {
  const first = createInvestigation(db, input);
  const second = createInvestigation(db, { ...input, title: 'second' });
  expect(claimInvestigation(db)?.id).toBe(first.id);
  expect(claimInvestigation(db)?.id).toBe(second.id);
  expect(claimInvestigation(db)).toBeNull();

  finishInvestigation(db, first.id, { status: 'succeeded', result: '## Findings' });
  expect(getInvestigation(db, first.id)).toMatchObject({
    status: 'succeeded',
    result: '## Findings',
  });
  expect(eventTypes(first.id)).toEqual([
    'investigation_queued',
    'investigation_started',
    'investigation_finished',
  ]);
  expect(listInvestigations(db, input.projectId).map((row) => row.id)).toEqual([
    second.id,
    first.id,
  ]);
});

test('reruns only a finished investigation and clears its answer', () => {
  const created = createInvestigation(db, input);
  expect(() => rerunInvestigation(db, created.id)).toThrow('not finished');
  claimInvestigation(db);
  finishInvestigation(db, created.id, { status: 'failed', error: 'boom' });
  expect(rerunInvestigation(db, created.id)).toMatchObject({ status: 'queued', error: null });
});

test('cancels a queued investigation but leaves a running one to the worker', () => {
  const queued = createInvestigation(db, input);
  expect(cancelQueuedInvestigation(db, queued.id)).toBe(true);
  expect(getInvestigation(db, queued.id).status).toBe('cancelled');

  const running = createInvestigation(db, input);
  claimInvestigation(db);
  expect(cancelQueuedInvestigation(db, running.id)).toBe(false);
  expect(() => {
    deleteInvestigation(db, running.id);
  }).toThrow('still running');

  failInterruptedInvestigations(db);
  expect(getInvestigation(db, running.id)).toMatchObject({ status: 'failed' });
  deleteInvestigation(db, running.id);
  expect(() => getInvestigation(db, running.id)).toThrow('not found');
});
