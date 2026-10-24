// Tests a Notion action setting several properties: its checks, and the values it sends, all or nothing.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import type { NotionValue } from './event-actions';
import { checkedNotionAction, notionSets, notionSetsText } from './event-notion-action';
import { saveNotionConnection, storeNotionSchema } from './integrations/notion-integration';
import type { NotionProperty } from './notion-api';
import * as schema from './tables';

let db: Db;
let projectId: number;

const PR: NotionProperty = { id: 'p%3Ar', name: 'PR', type: 'url', options: [] };
const NUMBER: NotionProperty = { id: 'n%3Ab', name: 'PR number', type: 'number', options: [] };
const STATUS: NotionProperty = {
  id: 's%3At',
  name: 'Status',
  type: 'status',
  options: ['Todo', 'In review', 'Done'],
};
const PROPERTIES = [PR, NUMBER, STATUS];

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
});

function check(values: unknown): unknown {
  return checkedNotionAction(db, projectId, { kind: 'notion_property', values });
}

test('a Notion action keeps every property it sets, in order', () => {
  const values: NotionValue[] = [
    { propertyId: 's%3At', value: 'In review' },
    { propertyId: 'p%3Ar', value: '{pr.url}' },
  ];
  expect(check(values)).toEqual({ kind: 'notion_property', values });
});

test('a Notion action sets at least one property, each once, and names the one refused', () => {
  expect(() => check([])).toThrow('Pick a property');
  expect(() =>
    check([
      { propertyId: 'p%3Ar', value: '{pr.url}' },
      { propertyId: 'p%3Ar', value: '{issue.url}' },
    ]),
  ).toThrow('PR is set twice');
  expect(() =>
    check([
      { propertyId: 'p%3Ar', value: '{pr.url}' },
      { propertyId: 's%3At', value: 'Shipped' },
    ]),
  ).toThrow('Status: "Shipped" is not a status of this property');
  expect(() => check([{ propertyId: 'n%3Ab', value: '{pr.link}' }])).toThrow(
    'PR number: Unknown variable: {pr.link}',
  );
});

test('the values sent are all there, or none is', () => {
  const action = {
    kind: 'notion_property' as const,
    values: [
      { propertyId: 'p%3Ar', value: '{pr.url}' },
      { propertyId: 'n%3Ab', value: '{pr.number}' },
    ],
  };
  const sets = notionSets(PROPERTIES, action, { 'pr.url': 'https://x/7', 'pr.number': '7' });
  expect(sets).toEqual({
    sets: [
      { property: PR, text: 'https://x/7', value: { url: 'https://x/7' } },
      { property: NUMBER, text: '7', value: { number: 7 } },
    ],
  });
  expect('sets' in sets ? notionSetsText(sets.sets) : '').toBe(
    'PR set to "https://x/7", PR number set to "7"',
  );
  expect(notionSets(PROPERTIES, action, { 'pr.url': 'https://x/7', 'pr.number': 'x' })).toEqual({
    error: 'PR number: "x" is not a number',
  });
  const gone = notionSets([NUMBER], action, {});
  expect('error' in gone ? gone.error : '').toContain('no longer in the Notion data source');
});
