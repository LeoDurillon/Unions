// The specs a review checks its change against (a ticket's or a pull request's under review): the
// list the Specs bar shows, read by Review with agent, Explain and Group by spec.
import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';
import { currentReviews } from './schema-reviews';
import { SPEC_SOURCES } from './spec-source-kinds';

/**
 * One spec of a review (`ticketId` or `reviewId`). Its text is read from its source each time unless
 * the user edited it (`text`). A `notion` row of a pull request under review is a page linked to it.
 */
export const reviewSpecs = sqliteTable(
  'review_specs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    reviewId: integer('review_id').references((): AnySQLiteColumn => currentReviews.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind', { enum: SPEC_SOURCES }).notNull(),
    /** The Notion page id or the issue number; null for the ticket's text and the PR's description. */
    ref: text('ref'),
    /** As last read (`Notion: Seuil RFR`), to list the specs without reading their sources. */
    label: text('label').notNull(),
    /** The Notion page's or the issue's URL, as last read. */
    url: text('url'),
    /** The user's edited text; null: read from the source. */
    text: text('text'),
    position: integer('position').notNull().default(0),
    /** Removed by the user from the list it started with: kept so it is not added back. */
    removed: integer('removed', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('review_specs_ticket_idx').on(t.ticketId),
    index('review_specs_review_idx').on(t.reviewId),
  ],
);

export type ReviewSpecRow = typeof reviewSpecs.$inferSelect;
