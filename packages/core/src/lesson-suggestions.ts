// The lesson writer's queue: a run asked from the Memory page, claimed by the worker, then accepted or dismissed.
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { Db } from './db';
import type { LessonInput } from './lesson-input';
import * as schema from './tables';

export type LessonSuggestion = typeof schema.lessonSuggestions.$inferSelect;

export type LessonSuggestionOutcome =
  | { status: 'ready'; suggestions: LessonInput[] }
  | { status: 'failed'; error: string };

/** Why a run is refused; the web answers 409 with the message. */
export class LessonSuggestionError extends Error {}

/** The feedback one run reads at most: the newest ones when more are asked. */
export const MAX_SUGGESTION_FEEDBACK = 60;

const ACTIVE = ['queued', 'running'] as const;

function update(db: Db, id: number, values: Partial<LessonSuggestion>): LessonSuggestion {
  return db
    .update(schema.lessonSuggestions)
    .set(values)
    .where(eq(schema.lessonSuggestions.id, id))
    .returning()
    .get();
}

/** The project's latest run, unless dismissed: what the Memory page shows. */
export function latestLessonSuggestion(db: Db, projectId: number): LessonSuggestion | null {
  const row = db
    .select()
    .from(schema.lessonSuggestions)
    .where(eq(schema.lessonSuggestions.projectId, projectId))
    .orderBy(desc(schema.lessonSuggestions.id))
    .get();
  return row && row.status !== 'dismissed' ? row : null;
}

/** Queues a run over the project's feedback `feedbackIds`; one runs at a time per project. */
export function queueLessonSuggestion(
  db: Db,
  projectId: number,
  feedbackIds: readonly number[],
): LessonSuggestion {
  return db.transaction((tx) => {
    const known = tx
      .select({ id: schema.feedbackEvents.id })
      .from(schema.feedbackEvents)
      .where(
        and(
          eq(schema.feedbackEvents.projectId, projectId),
          inArray(schema.feedbackEvents.id, [...feedbackIds]),
        ),
      )
      .orderBy(desc(schema.feedbackEvents.id))
      .limit(MAX_SUGGESTION_FEEDBACK)
      .all();
    if (known.length === 0) {
      throw new LessonSuggestionError('Pick feedback of this project');
    }
    const active = tx
      .select({ id: schema.lessonSuggestions.id })
      .from(schema.lessonSuggestions)
      .where(
        and(
          eq(schema.lessonSuggestions.projectId, projectId),
          inArray(schema.lessonSuggestions.status, [...ACTIVE]),
        ),
      )
      .get();
    if (active) {
      throw new LessonSuggestionError('The lesson writer is already working on this project');
    }
    return tx
      .insert(schema.lessonSuggestions)
      .values({ projectId, feedbackIds: known.map((row) => row.id).toReversed() })
      .returning()
      .get();
  });
}

/** The oldest queued run, now running; null when none waits. */
export function claimLessonSuggestion(db: Db): LessonSuggestion | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(schema.lessonSuggestions)
      .where(eq(schema.lessonSuggestions.status, 'queued'))
      .orderBy(asc(schema.lessonSuggestions.id))
      .get();
    return next
      ? tx
          .update(schema.lessonSuggestions)
          .set({ status: 'running', startedAt: Date.now() })
          .where(eq(schema.lessonSuggestions.id, next.id))
          .returning()
          .get()
      : null;
  });
}

export function finishLessonSuggestion(
  db: Db,
  id: number,
  outcome: LessonSuggestionOutcome,
): LessonSuggestion {
  return update(db, id, {
    ...(outcome.status === 'ready'
      ? { status: 'ready', suggestions: outcome.suggestions }
      : { status: 'failed', error: outcome.error }),
    finishedAt: Date.now(),
  });
}

/** Hides a run from the Memory page; false when it is not the project's or still working. */
export function dismissLessonSuggestion(db: Db, projectId: number, id: number): boolean {
  const row = db
    .select()
    .from(schema.lessonSuggestions)
    .where(
      and(eq(schema.lessonSuggestions.id, id), eq(schema.lessonSuggestions.projectId, projectId)),
    )
    .get();
  if (!row || row.status === 'queued' || row.status === 'running') {
    return false;
  }
  update(db, id, { status: 'dismissed' });
  return true;
}

/** A run the worker was stopped in the middle of fails, so the user can ask again. */
export function recoverLessonSuggestions(db: Db): void {
  db.update(schema.lessonSuggestions)
    .set({ status: 'failed', error: 'The worker stopped during the run', finishedAt: Date.now() })
    .where(eq(schema.lessonSuggestions.status, 'running'))
    .run();
}
