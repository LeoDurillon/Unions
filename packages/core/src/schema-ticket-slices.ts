// The slices of a ticket split into a stack of pull requests: a part of the spec and its commits.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

/**
 * One slice of a split ticket, bottom first (`position` 1). A slice owns the commits after the tip
 * of the one below, up to its own. The top slice is the ticket's own branch and pull request
 * (`tickets.branch`, `tickets.pr_number`); the lower ones get `<branch>-s<position>`. A ticket
 * without rows is not split; a split ticket has two or more.
 */
export const ticketSlices = sqliteTable(
  'ticket_slices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    /** The part of the spec the slice implements, in the split plan's words. */
    spec: text('spec').notNull(),
    tipSha: text('tip_sha').notNull(),
    branch: text('branch').notNull(),
    /** Null until its pull request is opened. */
    prNumber: integer('pr_number'),
    /** The pull request's state on GitHub, polled by the worker; null until known. */
    prState: text('pr_state', { enum: ['open', 'closed', 'merged'] }),
    prMergedAt: integer('pr_merged_at'),
    /**
     * The branch GitHub merged it into: the project's base, else a slice's branch (merged out of
     * order, which leaves its code out of the base).
     */
    mergedInto: text('merged_into'),
    /** Its tip when it merged: the remaining slices are moved with `rebase --onto <base> <it>`. */
    mergedTipSha: text('merged_tip_sha'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at')
      .notNull()
      .default(now)
      .$onUpdate(() => Date.now()),
  },
  (t) => [uniqueIndex('ticket_slices_ticket_idx').on(t.ticketId, t.position)],
);
