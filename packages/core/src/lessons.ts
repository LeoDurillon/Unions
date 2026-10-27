// The project's memory: lessons (rules per agent step, sent to that step's runs) and the feedback they are curated from.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { sharedPrompt } from './agents';
import type { Db } from './db';
import { REPORT_LESSONS, type LessonInput, type LessonSection } from './lesson-input';
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

/** Whether the project sends its lessons to its agents: on unless turned off. */
function memoryOn(db: Db, projectId: number): boolean {
  const project = db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  return project?.config.memory !== false;
}

/** The rules of a section as a prompt's list; none when memory is off. */
function rulesOf(db: Db, projectId: number, section: Step | LessonSection): string[] {
  if (!memoryOn(db, projectId)) {
    return [];
  }
  return listLessons(db, projectId)
    .filter((lesson) => lesson.section === section)
    .map((lesson) => `- ${lesson.rule}`);
}

/** The lessons for `step` as a prompt section; empty when there are none or memory is off. */
export function lessonsPrompt(db: Db, projectId: number, step: Step): string {
  const rules = rulesOf(db, projectId, step);
  if (rules.length === 0) {
    return '';
  }
  return `# Lessons from past tickets\n\nThe user wrote these rules from their feedback on earlier tickets of this project. Follow them.\n\n${rules.join('\n')}`;
}

/** The spec report's lessons as a prompt section; empty when there are none or memory is off. */
export function reportLessonsPrompt(db: Db, projectId: number): string {
  const rules = rulesOf(db, projectId, REPORT_LESSONS);
  if (rules.length === 0) {
    return '';
  }
  return `# Lessons from past reports\n\nThe user wrote these rules from their feedback on earlier spec reports of this project. Follow them.\n\n${rules.join('\n')}`;
}

/** Adds one lesson after the project's others. */
export function addLesson(db: Db, projectId: number, lesson: LessonInput): Lesson {
  const last = listLessons(db, projectId).at(-1);
  return db
    .insert(schema.lessons)
    .values({ projectId, ...lesson, position: (last?.position ?? -1) + 1 })
    .returning()
    .get();
}

/** What a ticket step's agent gets first: the shared and project instructions, then the step's lessons. */
export function stepSharedPrompt(db: Db, projectId: number, step: Step): string {
  const shared = sharedPrompt(db, projectId);
  const lessons = lessonsPrompt(db, projectId, step);
  return lessons === '' ? shared : `${shared}\n\n${lessons}`;
}
