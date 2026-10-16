// Tests how a rule's action is read: its kind, a missing kind as Notion's, and the checks of a GitHub comment and a notification.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import { EventRuleError } from './event-notion-action';
import { checkRule, storeNotionSchema } from './event-rules';
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
    values: [{ propertyId: 'p%3Ar', value: '{pr.url}' }],
  });
});

test('a GitHub comment says where it goes and what it says, with known variables', () => {
  expect(check({ kind: 'github_comment', on: 'pull_request', body: ' Ready: {pr.url} ' })).toEqual({
    kind: 'github_comment',
    on: 'pull_request',
    body: 'Ready: {pr.url}',
  });
  expect(() => check({ kind: 'github_comment', on: 'wiki', body: 'x' })).toThrow('Pick where');
  expect(() => check({ kind: 'github_comment', on: 'issue', body: '  ' })).toThrow(
    'Write the comment',
  );
  expect(() => check({ kind: 'github_comment', on: 'issue', body: '{pr.link}' })).toThrow(
    'Unknown variable: {pr.link}',
  );
});

test('a GitHub comment needs no Notion columns', () => {
  db.delete(schema.notionDataSources).run();
  expect(check({ kind: 'github_comment', on: 'issue', body: 'Done' })).toMatchObject({
    kind: 'github_comment',
  });
});

test('a notification in Union holds a message with known variables, not too long', () => {
  expect(check({ kind: 'union_notification', message: ' Ready: {pr.url} ' })).toEqual({
    kind: 'union_notification',
    message: 'Ready: {pr.url}',
  });
  expect(() => check({ kind: 'union_notification', message: ' ' })).toThrow(
    'Write the notification',
  );
  expect(() => check({ kind: 'union_notification', message: 'x'.repeat(301) })).toThrow(
    'at most 300',
  );
  expect(() => check({ kind: 'union_notification', message: '{nope}' })).toThrow(
    'Unknown variable',
  );
});

test('a pull request action keeps its checked changes, and needs no Notion columns', () => {
  db.delete(schema.notionDataSources).run();
  expect(
    check({ kind: 'github_pull_request', changes: [{ kind: 'assignees', users: ['ada'] }] }),
  ).toEqual({ kind: 'github_pull_request', changes: [{ kind: 'assignees', users: ['ada'] }] });
  expect(() => check({ kind: 'github_pull_request', changes: [] })).toThrow(
    'Pick what to change on the pull request',
  );
});
