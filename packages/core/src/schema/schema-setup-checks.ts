// What the worker checks of a setup proposal without Claude: its checks run, its preview resolved, and how each ended.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { investigations, now } from './schema';
import type { PreviewConfig } from './schema-types';

export const SETUP_CHECK_KINDS = ['checks', 'preview'] as const;
export type SetupCheckKind = (typeof SETUP_CHECK_KINDS)[number];

export const SETUP_CHECK_STATUSES = [
  'queued',
  'running',
  'passed',
  'failed',
  /** The install or the check command ran out of time (`stage` says which). */
  'timed_out',
] as const;

/** Where a running check is; once finished, where it stopped. */
export const SETUP_CHECK_STAGES = ['cloning', 'installing', 'checking', 'resolving'] as const;
export type SetupCheckStage = (typeof SETUP_CHECK_STAGES)[number];

/** The values checked: the install and check commands, or the preview settings Apply would save. */
export type SetupCheckInput =
  | { kind: 'checks'; installCommand: string; gateCommand: string }
  | { kind: 'preview'; preview: PreviewConfig };

/**
 * A check of a setup proposal's values, run by the worker in a throwaway container on a fresh
 * clone, without Claude: queued when the agent answers, and again on Test again (the web queues it).
 * The latest of each kind is the one shown.
 */
export const setupChecks = sqliteTable(
  'setup_checks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    investigationId: integer('investigation_id')
      .notNull()
      .references(() => investigations.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: SETUP_CHECK_KINDS }).notNull(),
    input: text('input', { mode: 'json' }).$type<SetupCheckInput>().notNull(),
    status: text('status', { enum: SETUP_CHECK_STATUSES }).notNull().default('queued'),
    stage: text('stage', { enum: SETUP_CHECK_STAGES }),
    /** The end of the output, or why the preview cannot run. */
    output: text('output').notNull().default(''),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('setup_checks_investigation_idx').on(t.investigationId, t.kind, t.id)],
);
