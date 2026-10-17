// The project's memory: lessons (rules per agent step, sent to that step's runs) and the feedback they are curated from.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { sharedPrompt } from './agents';
import type { Db } from './db';
import type { LessonInput } from './lesson-input';
import type { Step } from './states';
import * as schema from './tables';

export type Lesson = typeof schema.lessons.$inferSelect;

/** One Revise or final-review feedback, with the ticket it was given on (null once removed). */
export type FeedbackItem = {
  id: number;
  ticketId: number | null;
  ticketTitle: string | null;
  issueNumber: number | null;
  section: string;
  text: string;
  curatedAt: number | null;
  createdAt: number;
};

/** The newest feedback the Memory page lists. */
const FEEDBACK_LIMIT = 200;

/** The project's lessons, in the order the user saved them. */
export function listLessons(db: Db, projectId: number): Lesson[] {
  return db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.projectId, projectId))
    .orderBy(asc(schema.lessons.position), asc(schema.lessons.id))
    .all();
}

/**
 * Replaces the project's lessons with `lessons`, and marks the feedback `curated` (the ones they
 * were made from) as curated, in one transaction.
 */
export function saveLessons(
  db: Db,
  projectId: number,
  lessons: readonly LessonInput[],
  curated: readonly number[] = [],
): Lesson[] {
  db.transaction((tx) => {
    tx.delete(schema.lessons).where(eq(schema.lessons.projectId, projectId)).run();
    if (lessons.length > 0) {
      tx.insert(schema.lessons)
        .values(lessons.map((lesson, position) => ({ projectId, ...lesson, position })))
        .run();
    }
    if (curated.length > 0) {
      tx.update(schema.feedbackEvents)
        .set({ curatedAt: Date.now() })
        .where(
          and(
            eq(schema.feedbackEvents.projectId, projectId),
            inArray(schema.feedbackEvents.id, [...curated]),
            isNull(schema.feedbackEvents.curatedAt),
          ),
        )
        .run();
    }
  });
  return listLessons(db, projectId);
}

/** The project's feedback, newest first. */
export function listFeedback(db: Db, projectId: number): FeedbackItem[] {
  const feedback = schema.feedbackEvents;
  return db
    .select({
      id: feedback.id,
      ticketId: feedback.ticketId,
      ticketTitle: schema.tickets.title,
      issueNumber: schema.tickets.issueNumber,
      section: feedback.section,
      text: feedback.text,
      curatedAt: feedback.curatedAt,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .leftJoin(schema.tickets, eq(schema.tickets.id, feedback.ticketId))
    .where(eq(feedback.projectId, projectId))
    .orderBy(desc(feedback.createdAt), desc(feedback.id))
    .limit(FEEDBACK_LIMIT)
    .all();
}

/** Marks one feedback curated (dismissed or made a lesson) or back to new; false when it is not the project's. */
export function setFeedbackCurated(
  db: Db,
  projectId: number,
  feedbackId: number,
  curated: boolean,
): boolean {
  const updated = db
    .update(schema.feedbackEvents)
    .set({ curatedAt: curated ? Date.now() : null })
    .where(
      and(eq(schema.feedbackEvents.projectId, projectId), eq(schema.feedbackEvents.id, feedbackId)),
    )
    .returning({ id: schema.feedbackEvents.id })
    .all();
  return updated.length > 0;
}

/** The lessons for `step` as a prompt section; empty when there are none. */
export function lessonsPrompt(db: Db, projectId: number, step: Step): string {
  const rules = listLessons(db, projectId)
    .filter((lesson) => lesson.section === step)
    .map((lesson) => `- ${lesson.rule}`);
  if (rules.length === 0) {
    return '';
  }
  return `# Lessons from past tickets\n\nThe user wrote these rules from their feedback on earlier tickets of this project. Follow them.\n\n${rules.join('\n')}`;
}

/** What a ticket step's agent gets first: the shared and project instructions, then the step's lessons. */
export function stepSharedPrompt(db: Db, projectId: number, step: Step): string {
  const shared = sharedPrompt(db, projectId);
  const lessons = lessonsPrompt(db, projectId, step);
  return lessons === '' ? shared : `${shared}\n\n${lessons}`;
}
