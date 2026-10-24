// The outside trackers a project is connected to (Notion): secret, config and the tracker's columns as read.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { IntegrationKindName } from './integrations/kinds';
import { now, projects } from './schema';

/**
 * One tracker connected to a project, one per kind. `config` and `fields` are JSON whose shape depends
 * on `kind`; the kind's provider reads them through its own type guard.
 */
export const integrations = sqliteTable(
  'integrations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<IntegrationKindName>().notNull(),
    /** The tracker's secret (Notion's integration secret). Never sent to the browser. */
    secret: text('secret').notNull(),
    /** Where tickets come from (Notion: `{ dataSourceId }`). */
    config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    /** The tracker's columns as last read (Notion: the data source); null until read. */
    fields: text('fields', { mode: 'json' }).$type<unknown>(),
    /** The source's name for the UI (the data source's title); empty until verified. */
    title: text('title').notNull().default(''),
    fieldsReadAt: integer('fields_read_at'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at')
      .notNull()
      .default(now)
      .$onUpdate(() => Date.now()),
  },
  (t) => [uniqueIndex('integrations_project_kind_idx').on(t.projectId, t.kind)],
);
