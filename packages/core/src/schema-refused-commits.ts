import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

/** What a run paused on a refused commit needs to finish without its agent. */
export type ResumeState = {
  /** Agent rounds the implementation took. */
  iterations?: number;
  /**
   * Rebase and simplify: the branch's commit on GitHub (the push lease), and the commit to restore on
   * failure.
   */
  lease?: string;
  before?: string;
};

/**
 * Changes the agent left uncommitted that the repository's hook refused to commit. The run pauses
 * (`commit_refused`) until the user commits them without the hooks, sets them aside, or sends the
 * agent back. The decision applies to this exact diff (`diffHash`): a different one is asked again.
 */
export const refusedCommits = sqliteTable('refused_commits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  step: text('step', { enum: ['implement', 'rebase', 'retarget', 'simplify'] }).notNull(),
  files: text('files', { mode: 'json' }).$type<string[]>().notNull(),
  hookOutput: text('hook_output').notNull(),
  /** Shortened when very large; `diffHash` covers the whole diff. */
  diff: text('diff').notNull(),
  diffHash: text('diff_hash').notNull(),
  /** The agent's proposed message, then the one the user committed with. */
  message: text('message').notNull(),
  /** The agent's report, reused as the step's report once the run finishes. */
  report: text('report').notNull(),
  sessionId: text('session_id'),
  resumeState: text('resume_state', { mode: 'json' }).$type<ResumeState>().notNull(),
  resolution: text('resolution', { enum: ['commit', 'discard', 'revise'] }),
  createdAt: integer('created_at').notNull().default(now),
  resolvedAt: integer('resolved_at'),
});
