// Tests migration 0091 against every rule action shape saved before tracker actions: each reads the same after.
// A migrated action equals what the checks make of the old one (the browser's path for a release), and checks again
// to itself, so a saved rule edited and saved again is unchanged.

import { beforeEach, expect, test } from 'bun:test';

import { eq, sql } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from '../db';
import { saveNotionConnection, storeNotionSchema } from '../integrations/notion-integration';
import { notionSets } from '../integrations/notion-rule-check';
import { saveIntegration, storeFields } from '../integrations/store';
import * as schema from '../tables';
import { checkedAction } from './event-action-checks';
import type { EventAction } from './event-actions';

const MIGRATION = new URL('../../drizzle/0091_tracker_rule_actions.sql', import.meta.url);

const PROPERTIES = [
  { id: 'p%3Ar', name: 'PR', type: 'url', options: [] },
  { id: 's%3At', name: 'Status', type: 'status', options: ['Todo', 'Done'] },
];

const JIRA_FIELDS = {
  projectName: 'Apollo',
  issueTypes: [],
  statuses: [{ id: '3', name: 'In Review', category: 'indeterminate' }],
  fields: [
    { id: 'customfield_10050', name: 'PR link', type: 'text' },
    { id: 'labels', name: 'Labels', type: 'labels' },
    { id: 'assignee', name: 'Assignee', type: 'user' },
  ],
};

/** Every shape saved before: Notion's by property id, the three Jira kinds with their stored names. */
const OLD_ACTIONS = [
  {
    kind: 'notion_property',
    values: [
      { propertyId: 's%3At', value: 'Done' },
      { propertyId: 'p%3Ar', value: '{pr.url}' },
    ],
  },
  { kind: 'jira_transition', statusId: '3', statusName: 'In Review' },
  {
    kind: 'jira_field',
    values: [
      { fieldId: 'customfield_10050', fieldName: 'PR link', fieldType: 'text', value: '{pr.url}' },
      { fieldId: 'labels', fieldName: 'Labels', fieldType: 'labels', value: 'qa, {ticket.id}' },
      {
        fieldId: 'assignee',
        fieldName: 'Assignee',
        fieldType: 'user',
        value: 'Ada',
        picks: [{ id: 'u1', name: 'Ada' }],
      },
    ],
  },
  { kind: 'jira_comment', body: 'Ready for QA: {pr.url}' },
];

let db: Db;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'ntn', dataSourceId: 'ds' });
  storeNotionSchema(db, projectId, { title: 'Roadmap', properties: PROPERTIES });
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  const jira = saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  storeFields(db, jira.id, { title: 'Apollo', fields: JIRA_FIELDS });
});

/** Saves the action as it was stored before (no check), runs the migration's SQL, and reads it back. */
async function migrated(action: object): Promise<EventAction> {
  const { id } = db
    .insert(schema.eventRules)
    .values({
      projectId,
      name: 'Rule',
      enabled: true,
      trigger: { kind: 'pull_request_linked' },
      // Stored as the old code wrote it: the migration is what reads it.
      action: structuredClone(action) as EventAction,
    })
    .returning()
    .get();
  const statements = (await Bun.file(MIGRATION).text()).split('--> statement-breakpoint');
  for (const statement of statements) {
    db.run(sql.raw(statement));
  }
  const rule = db.select().from(schema.eventRules).where(eq(schema.eventRules.id, id)).get();
  if (!rule) {
    throw new Error('The rule is gone');
  }
  return rule.action;
}

test('each old action becomes what the checks make of it, and checks again to itself', async () => {
  for (const old of OLD_ACTIONS) {
    const after = await migrated(old);
    expect(after).toEqual(checkedAction(db, projectId, old));
    expect(checkedAction(db, projectId, after)).toEqual(after);
  }
});

test('a Notion value keeps its order, its property named and typed as last read', async () => {
  expect(await migrated(OLD_ACTIONS[0] ?? {})).toEqual({
    kind: 'tracker_fields',
    tracker: 'notion',
    values: [
      { fieldId: 's%3At', fieldName: 'Status', fieldType: 'status', value: 'Done' },
      { fieldId: 'p%3Ar', fieldName: 'PR', fieldType: 'url', value: '{pr.url}' },
    ],
  });
});

test('a property gone from the data source stays, unnamed, and fails as it did when the rule runs', async () => {
  const after = await migrated({
    kind: 'notion_property',
    values: [{ propertyId: 'gone', value: 'x' }],
  });
  expect(after).toEqual({
    kind: 'tracker_fields',
    tracker: 'notion',
    values: [{ fieldId: 'gone', fieldName: '', fieldType: '', value: 'x' }],
  });
  const sets = after.kind === 'tracker_fields' ? notionSets(PROPERTIES, after.values, {}) : null;
  expect(sets).toEqual({
    error:
      'A property it sets is no longer in the Notion data source: refresh it in the Events settings',
  });
});

test('the other kinds are left as they are', async () => {
  const comment = { kind: 'github_comment', on: 'pull_request', body: 'Hi' };
  expect(await migrated(comment)).toEqual(comment as EventAction);
});
