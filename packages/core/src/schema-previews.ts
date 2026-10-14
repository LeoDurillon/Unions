import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, projects, tickets } from './schema';

export const PREVIEW_STATUSES = ['starting', 'running', 'stopping', 'stopped', 'failed'] as const;

/**
 * A ticket's preview: its compose project (`union-t<id>`) run from the ticket's workspace, served by
 * the proxy at `url`. One row per ticket, kept after a stop so the panel shows how it ended.
 */
export const previews = sqliteTable('previews', {
  ticketId: integer('ticket_id')
    .primaryKey()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  status: text('status', { enum: PREVIEW_STATUSES }).notNull(),
  /** The first exposed service's address ("Open"). */
  url: text('url'),
  /** Every exposed service's address, in the settings' order. */
  urls: text('urls', { mode: 'json' }).$type<{ service: string; url: string }[]>(),
  error: text('error'),
  /** The last lines of the services' output, read on demand (`preview_logs`). */
  logTail: text('log_tail'),
  logAt: integer('log_at'),
  /** The file Union generated from the repository's compose file, as YAML, and when. */
  composeYaml: text('compose_yaml'),
  /** Why the last generation failed (the file was refused or could not be read). */
  composeError: text('compose_error'),
  composeAt: integer('compose_at'),
  /** The user's own version of it: when set, Start runs it instead of generating one. */
  override: text('override'),
  overrideAt: integer('override_at'),
  startedAt: integer('started_at'),
  updatedAt: integer('updated_at').notNull().default(now),
});

/**
 * A project's secret preview variables. The values never leave the server: the settings show the
 * names, the file shown for a preview reads `${NAME}`, and only the worker fills them in.
 */
export const previewSecrets = sqliteTable(
  'preview_secrets',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.name] })],
);
