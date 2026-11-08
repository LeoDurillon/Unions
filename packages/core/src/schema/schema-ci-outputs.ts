// CI output the user gave the implementer from the pull request's checks: a failed check, another job's log, a bot's comment.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

export const CI_OUTPUT_KINDS = [
  /** A failed check: its failed step's log, annotations and summary. */
  'check',
  /** Another job of the check's workflow run, which may hold the findings. */
  'job',
  /** A bot's comment on the pull request. */
  'comment',
] as const;

/**
 * What the implementer reads from the pull request's CI, as the user saw it before giving it: the
 * web reads GitHub and stores the text, the implementer's next run reads it.
 */
export const ciOutputs = sqliteTable(
  'ci_outputs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    /** The pull request's head commit the checks ran on. */
    headSha: text('head_sha').notNull(),
    kind: text('kind', { enum: CI_OUTPUT_KINDS }).notNull(),
    /** The check's or job's name, or the comment's author. */
    name: text('name').notNull(),
    url: text('url'),
    text: text('text').notNull(),
    /** As for command output: `next_run` until the implementer read it, `sent` after; null when taken back. */
    forAgent: text('for_agent', { enum: ['next_run', 'sent'] }),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('ci_outputs_ticket_idx').on(t.ticketId, t.id)],
);
