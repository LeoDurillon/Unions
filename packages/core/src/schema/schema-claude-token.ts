// The one-row table of the long-lived Claude token (`claude setup-token`) the agent containers get instead of the login.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

/**
 * The long-lived Claude token the agents run with, instead of a copy of the host's login (which
 * holds a refresh token). One row at most (`id` 1); none: the login is copied as before. Never sent
 * to the browser.
 */
export const claudeToken = sqliteTable('claude_token', {
  id: integer('id').primaryKey(),
  token: text('token').notNull(),
  savedAt: integer('saved_at').notNull().default(now),
});
