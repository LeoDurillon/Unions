// Files the user attached to a ticket, stored on the host under the attachments folder and copied
// into the ticket's container for the agents.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

/**
 * Files the user attached to a ticket, stored on the host under the attachments folder and copied
 * into the ticket's container for the agents. `blobId` is the file's git blob id: the host refuses
 * to push a branch that contains a file not allowed in the repository.
 */
export const ticketAttachments = sqliteTable(
  'ticket_attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    contentType: text('content_type').notNull(),
    note: text('note').notNull().default(''),
    allowInRepo: integer('allow_in_repo', { mode: 'boolean' }).notNull().default(false),
    blobId: text('blob_id').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('ticket_attachments_name_idx').on(t.ticketId, t.name)],
);
