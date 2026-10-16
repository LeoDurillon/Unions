// Tests how a rule's action kind is read: an unknown kind is refused, a missing one is Notion's.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import { checkRule, EventRuleError, storeNotionSchema } from './event-rules';
import * as schema from './tables';

let db: Db;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  storeNotionSchema(db, projectId, 'ds', {
    title: 'Roadmap',
    properties: [{ id: 'p%3Ar', name: 'PR', type: 'url', options: [] }],
  });
});

function check(action: unknown): unknown {
  const trigger = { kind: 'pull_request_linked' };
  return checkRule(db, projectId, { name: 'Rule', enabled: true, trigger, action }).action;
}

test('an action of an unknown kind is refused', () => {
  expect(() => check({ kind: 'carrier_pigeon', value: 'x' })).toThrow(EventRuleError);
});

test('an action without a kind is a Notion action, as rules were before other kinds', () => {
  expect(check({ propertyId: 'p%3Ar', value: '{pr.url}' })).toEqual({
    kind: 'notion_property',
    propertyId: 'p%3Ar',
    value: '{pr.url}',
  });
});
