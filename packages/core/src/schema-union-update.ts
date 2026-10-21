// The one-row table of Union's own update: the checkout against the remote's `main`, and the update's state.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

/**
 * Union's checkout against `origin/main`, as the worker's last check found it, and where an update
 * stands. One row (`id` 1), overwritten by every check.
 */
export const unionUpdate = sqliteTable('union_update', {
  id: integer('id').primaryKey(),
  localSha: text('local_sha').notNull(),
  /** Null until a fetch succeeded. */
  remoteSha: text('remote_sha'),
  ahead: integer('ahead').notNull().default(0),
  behind: integer('behind').notNull().default(0),
  /** The subjects of the commits behind, newest first (the first few). */
  subjects: text('subjects', { mode: 'json' }).$type<string[]>().notNull(),
  /** Why the checkout cannot update (a dirty tree, another branch…); null when it can. */
  refusal: text('refusal'),
  status: text('status', { enum: ['idle', 'updating', 'restarting', 'failed'] })
    .notNull()
    .default('idle'),
  /** The last check's or update's failure. */
  error: text('error'),
  checkedAt: integer('checked_at').notNull().default(now),
  /** When `status` last changed: an update that has said nothing for long is stale. */
  statusAt: integer('status_at').notNull().default(now),
});
