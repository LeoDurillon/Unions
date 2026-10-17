// The lesson writer's runs: the feedback the user gave it and the lessons it proposed.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { LessonInput } from './lesson-input';
import { now, projects } from './schema';

export const LESSON_SUGGESTION_STATUSES = [
  'queued',
  'running',
  /** Written: the user accepts lessons from it, or dismisses it. */
  'ready',
  'failed',
  'dismissed',
] as const;

/**
 * One run of the lesson writer over some of a project's feedback. Nothing becomes a lesson until
 * the user accepts it and saves the Memory page.
 */
export const lessonSuggestions = sqliteTable(
  'lesson_suggestions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    feedbackIds: text('feedback_ids', { mode: 'json' }).$type<number[]>().notNull(),
    status: text('status', { enum: LESSON_SUGGESTION_STATUSES }).notNull().default('queued'),
    suggestions: text('suggestions', { mode: 'json' }).$type<LessonInput[]>(),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('lesson_suggestions_project_idx').on(t.projectId, t.id)],
);
