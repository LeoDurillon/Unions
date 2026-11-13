// Tests a Notion action setting several properties: its checks, and the values it sends, all or nothing.

import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import type { NotionProperty } from '../integrations/notion-api';
import { saveNotionConnection, storeNotionSchema } from '../integrations/notion-integration';
import { notionSets, notionSetsText } from '../integrations/notion-rule-check';
import * as schema from '../tables';
import { checkedAction } from './event-action-checks';

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
  return checkedAction(db, projectId, { kind: 'tracker_fields', tracker: 'notion', values });
}

test('a Notion action keeps every property it sets, in order, with its name and type', () => {
  const values = [
    { fieldId: 's%3At', value: 'In review' },
    { fieldId: 'p%3Ar', value: '{pr.url}' },
  ];
  expect(check(values)).toEqual({
    kind: 'tracker_fields',
    tracker: 'notion',
    values: [
      { fieldId: 's%3At', fieldName: 'Status', fieldType: 'status', value: 'In review' },
      { fieldId: 'p%3Ar', fieldName: 'PR', fieldType: 'url', value: '{pr.url}' },
    ],
  });
});

test('a Notion action of a browser loaded before tracker actions is read the same', () => {
  const action = { kind: 'notion_property', values: [{ propertyId: 'p%3Ar', value: '{pr.url}' }] };
  expect(checkedAction(db, projectId, action)).toEqual({
    kind: 'tracker_fields',
    tracker: 'notion',
    values: [{ fieldId: 'p%3Ar', fieldName: 'PR', fieldType: 'url', value: '{pr.url}' }],
  });
  // The oldest rules held one property and no kind.
  expect(checkedAction(db, projectId, { propertyId: 'n%3Ab', value: '7' })).toMatchObject({
    values: [{ fieldId: 'n%3Ab', value: '7' }],
  });
});

test('a Notion action sets at least one property, each once, and names the one refused', () => {
  expect(() => check([])).toThrow('Pick a property');
  expect(() =>
    check([
      { fieldId: 'p%3Ar', value: '{pr.url}' },
      { fieldId: 'p%3Ar', value: '{issue.url}' },
    ]),
  ).toThrow('PR is set twice');
  expect(() =>
    check([
      { fieldId: 'p%3Ar', value: '{pr.url}' },
      { fieldId: 's%3At', value: 'Shipped' },
    ]),
  ).toThrow('Status: "Shipped" is not a status of this property');
  expect(() => check([{ fieldId: 'n%3Ab', value: '{pr.link}' }])).toThrow(
    'PR number: Unknown variable: {pr.link}',
  );
});

test('the values sent are all there, or none is', () => {
  const values = [
    { fieldId: 'p%3Ar', fieldName: 'PR', fieldType: 'url', value: '{pr.url}' },
    { fieldId: 'n%3Ab', fieldName: 'PR number', fieldType: 'number', value: '{pr.number}' },
  ];
  const sets = notionSets(PROPERTIES, values, { 'pr.url': 'https://x/7', 'pr.number': '7' });
  expect(sets).toEqual({
    sets: [
      { property: PR, text: 'https://x/7', value: { url: 'https://x/7' } },
      { property: NUMBER, text: '7', value: { number: 7 } },
    ],
  });
  expect('sets' in sets ? notionSetsText(sets.sets) : '').toBe(
    'PR set to "https://x/7", PR number set to "7"',
  );
  expect(notionSets(PROPERTIES, values, { 'pr.url': 'https://x/7', 'pr.number': 'x' })).toEqual({
    error: 'PR number: "x" is not a number',
  });
  const gone = notionSets([NUMBER], values, {});
  expect('error' in gone ? gone.error : '').toContain('no longer in the Notion data source');
});
