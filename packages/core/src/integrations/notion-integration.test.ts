import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import * as schema from '../tables';
import {
  notionAccessOf,
  notionSchemaOf,
  saveNotionConnection,
  storeNotionSchema,
} from './notion-integration';
import { integrationOf } from './store';

const COLUMNS = [{ id: 's%3At', name: 'Status', type: 'status', options: ['Todo'] }];

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
});

test('a project is connected to Notion with a secret, and reaches it once it has a data source', () => {
  expect(notionAccessOf(db, projectId)).toBeNull();
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  expect(integrationOf(db, projectId, 'notion')).toMatchObject({ secret: 'secret', config: {} });
  expect(notionAccessOf(db, projectId)).toBeNull();

  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: 'ds' });
  expect(notionAccessOf(db, projectId)).toMatchObject({ token: 'secret', dataSourceId: 'ds' });

  saveNotionConnection(db, projectId, { token: null, dataSourceId: 'ds' });
  expect(integrationOf(db, projectId, 'notion')).toBeNull();
});

test('the columns are stored once read, kept with a new secret, and forgotten with another data source', () => {
  expect(() => storeNotionSchema(db, projectId, { title: 'Roadmap', properties: COLUMNS })).toThrow(
    'not connected',
  );
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: 'ds' });
  expect(notionSchemaOf(db, projectId)).toBeNull();

  const stored = storeNotionSchema(db, projectId, { title: 'Roadmap', properties: COLUMNS });
  expect(stored).toMatchObject({
    projectId,
    dataSourceId: 'ds',
    title: 'Roadmap',
    properties: COLUMNS,
  });
  expect(notionSchemaOf(db, projectId)).toEqual(stored);
  expect(integrationOf(db, projectId, 'notion')?.title).toBe('Roadmap');

  saveNotionConnection(db, projectId, { token: 'other secret', dataSourceId: 'ds' });
  expect(notionSchemaOf(db, projectId)).toEqual(stored);

  saveNotionConnection(db, projectId, { token: 'other secret', dataSourceId: 'other' });
  expect(notionSchemaOf(db, projectId)).toBeNull();
  expect(integrationOf(db, projectId, 'notion')).toMatchObject({
    fields: null,
    fieldsReadAt: null,
    title: '',
  });
});

test('an integration goes with its project', () => {
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: 'ds' });
  db.delete(schema.projects).run();
  expect(db.select().from(schema.integrations).all()).toEqual([]);
});
