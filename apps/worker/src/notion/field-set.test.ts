// Tests setting a Notion page's property by hand: the value Notion gets, the events, a refusal, the command's hand-off.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  NotionError,
  saveNotionConnection,
  schema,
  SET_TRACKER_FIELDS,
  type Db,
  type NotionApi,
  type TrackerFieldSet,
} from '@union/core';

import { NO_HOOKS } from '../command-hooks';
import { drainCommands } from '../commands';
import { setNotionField } from './field-set';

let db: Db;
let projectId: number;
let ticketId: number;
let sent: unknown[] = [];
let refuse: number | null = null;

const notion = {
  updatePage: (token: string, pageId: string, properties: unknown) => {
    sent.push({ token, pageId, properties });
    return refuse === null
      ? Promise.resolve()
      : Promise.reject(new NotionError('Notion: refused', refuse));
  },
} as unknown as NotionApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, githubToken: 'ghp_x' })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  ticketId = createTicket(db, { projectId, title: 'Export', body: '' }).id;
  sent = [];
  refuse = null;
});

function change(field: Partial<TrackerFieldSet['field']>, value: string): TrackerFieldSet {
  return {
    projectId,
    kind: 'notion',
    itemId: 'page-1',
    ticketId,
    reviewId: null,
    field: { id: 'p1', name: 'Priority', type: 'select', options: [], ...field },
    value,
    text: value,
    picks: [],
  };
}

function lastEvent(): { type: string; ticketId: number | null; payload: unknown } | undefined {
  return db.select().from(schema.events).all().at(-1);
}

test('a select is sent as Notion takes it, and logged on the ticket', async () => {
  await setNotionField(db, notion, 7, change({}, 'P1'));
  expect(sent).toEqual([
    { token: 'secret', pageId: 'page-1', properties: { p1: { select: { name: 'P1' } } } },
  ]);
  expect(lastEvent()).toMatchObject({
    type: 'tracker_field_set',
    ticketId,
    payload: { commandId: 7, kind: 'notion', fieldId: 'p1', fieldName: 'Priority', text: 'P1' },
  });
});

test('a ticked box and a cleared date', async () => {
  await setNotionField(db, notion, 1, change({ id: 'c', type: 'checkbox' }, 'true'));
  await setNotionField(db, notion, 2, change({ id: 'd', type: 'date' }, ''));
  expect(sent.map((one) => (one as { properties: unknown }).properties)).toEqual([
    { c: { checkbox: true } },
    { d: { date: null } },
  ]);
});

test('a value Notion cannot take is not sent; a refusal names the capability', async () => {
  await setNotionField(db, notion, 3, change({ type: 'number' }, 'many'));
  expect(sent).toEqual([]);
  expect(lastEvent()).toMatchObject({
    type: 'tracker_field_failed',
    payload: { error: '"many" is not a number' },
  });
  refuse = 403;
  await setNotionField(db, notion, 4, change({}, 'P2'));
  const refused = lastEvent();
  expect(refused?.type).toBe('tracker_field_failed');
  expect(JSON.stringify(refused?.payload)).toContain('Update content');
});

test('the command hands the change to the worker hook', () => {
  const payload = change({}, 'P1');
  const command = db
    .insert(schema.commands)
    .values({ type: SET_TRACKER_FIELDS, ticketId, payload })
    .returning()
    .get();
  const handed: unknown[] = [];
  drainCommands(db, {
    ...NO_HOOKS,
    setTrackerField: (commandId, set) => {
      handed.push([commandId, set]);
    },
  });
  expect(handed).toEqual([[command.id, payload]]);
});
