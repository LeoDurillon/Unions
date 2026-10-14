import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

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
  url: text('url'),
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
