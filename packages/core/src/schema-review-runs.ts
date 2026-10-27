// The columns an agent run on a review shares (grouping, explanation, report): its owner and its status.
import { integer, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { tickets } from './schema';
import { currentReviews } from './schema-reviews';

/** The review the run is on: a ticket's branch or a pull request under review (one of them). */
export const reviewOwnerColumns = {
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
  reviewId: integer('review_id').references((): AnySQLiteColumn => currentReviews.id, {
    onDelete: 'cascade',
  }),
};

export const runStatusColumn = text('status', {
  enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
})
  .notNull()
  .default('queued');
