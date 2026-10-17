import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

import { now, projects, tickets } from './schema';
import { currentReviews } from './schema-reviews';

export const PREVIEW_STATUSES = ['starting', 'running', 'stopping', 'stopped', 'failed'] as const;

/** The last end-to-end run the user asked for: `skipped` means it could not run (the reason in its output). */
export const E2E_STATUSES = ['running', 'green', 'red', 'skipped'] as const;

/**
 * A preview: its compose project (`union-t<id>` for a ticket, `union-r<id>` for a pull request under
 * review) run from its owner's workspace, served by the proxy at `url`. One row per owner (exactly one
 * of `ticket_id` and `review_id`), kept after a stop so the panel shows how it ended.
 */
export const previews = sqliteTable(
  'previews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    reviewId: integer('review_id').references((): AnySQLiteColumn => currentReviews.id, {
      onDelete: 'cascade',
    }),
    /** The owner's project: what the per-project cap counts. */
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
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
    /** Every profile and every service of the compose file, whatever the profiles enabled: what the settings offer. */
    composeCatalog: text('compose_catalog', { mode: 'json' }).$type<{
      profiles: string[];
      services: string[];
    }>(),
    /** The user's own version of it: when set, Start runs it instead of generating one. */
    override: text('override'),
    overrideAt: integer('override_at'),
    startedAt: integer('started_at'),
    e2eStatus: text('e2e_status', { enum: E2E_STATUSES }),
    /** The last lines the e2e command printed, or why it did not run. */
    e2eOutput: text('e2e_output'),
    e2eExitCode: integer('e2e_exit_code'),
    e2eScreenshots: integer('e2e_screenshots'),
    e2eAt: integer('e2e_at'),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('previews_ticket_idx').on(t.ticketId),
    uniqueIndex('previews_review_idx').on(t.reviewId),
    check('previews_one_owner', sql`(${t.ticketId} IS NULL) <> (${t.reviewId} IS NULL)`),
  ],
);

/**
 * The failure screenshots of a review's last e2e run (a ticket keeps its own as ticket files, which
 * the final review reads). The files are under the review's folder in Union's data.
 */
export const previewScreenshots = sqliteTable(
  'preview_screenshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    previewId: integer('preview_id')
      .notNull()
      .references(() => previews.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('preview_screenshots_idx').on(t.previewId, t.name)],
);

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
