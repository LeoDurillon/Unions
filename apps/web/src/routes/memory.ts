// `/api/projects/:projectId/lessons`, `/feedback` and `/lesson-suggestion`: the project's memory (the worker runs the lesson writer).
import {
  dismissLessonSuggestion,
  latestLessonSuggestion,
  LessonSuggestionError,
  queueLessonSuggestion,
  listFeedback,
  listLessons,
  parseLessonsSave,
  saveLessons,
  schema,
  setFeedbackCurated,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { ACCEPTED, BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';

function projectIdOf(db: Db, c: Context): number {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  return id;
}

/** `PUT /lessons` with every lesson and the feedback ids the new ones come from. */
async function putLessons(db: Db, c: Context): Promise<Response> {
  const projectId = projectIdOf(db, c);
  const save = parseLessonsSave(await readObject(c.req.raw));
  if (typeof save === 'string') {
    throw fail(BAD_REQUEST, save);
  }
  return c.json(saveLessons(db, projectId, save.lessons, save.curated));
}

/** `PATCH /feedback/:feedbackId` with `{ curated }`: dismissed (or made a lesson), or back to new. */
async function patchFeedback(db: Db, c: Context): Promise<Response> {
  const projectId = projectIdOf(db, c);
  const feedbackId = requireId(c.req.param('feedbackId'), 'feedback id');
  const { curated } = await readObject(c.req.raw);
  if (typeof curated !== 'boolean') {
    throw fail(BAD_REQUEST, '"curated" must be true or false');
  }
  if (!setFeedbackCurated(db, projectId, feedbackId, curated)) {
    throw fail(NOT_FOUND, 'Feedback not found');
  }
  return c.json({ ok: true });
}

/** `POST /lesson-suggestion` with `{ feedbackIds }`: queues the lesson writer on them (the worker runs it). */
async function suggestLessons(db: Db, c: Context): Promise<Response> {
  const projectId = projectIdOf(db, c);
  const { feedbackIds } = await readObject(c.req.raw);
  if (!Array.isArray(feedbackIds) || !feedbackIds.every((id) => Number.isInteger(id))) {
    throw fail(BAD_REQUEST, '"feedbackIds" must be a list of feedback ids');
  }
  try {
    const ids = feedbackIds.filter((id): id is number => typeof id === 'number');
    return c.json(queueLessonSuggestion(db, projectId, ids), ACCEPTED);
  } catch (error) {
    throw error instanceof LessonSuggestionError ? fail(CONFLICT, error.message) : error;
  }
}

function dismissSuggestion(db: Db, c: Context): Response {
  const projectId = projectIdOf(db, c);
  const id = requireId(c.req.param('suggestionId'), 'suggestion id');
  if (!dismissLessonSuggestion(db, projectId, id)) {
    throw fail(NOT_FOUND, 'No finished suggestion to dismiss');
  }
  return c.json({ ok: true });
}

/** Under `/api/projects`: `/:projectId/lessons`, `/feedback` and `/lesson-suggestion`. */
export function memoryRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/lessons', (c) => c.json(listLessons(db, projectIdOf(db, c))));
  routes.put('/:projectId/lessons', (c) => putLessons(db, c));
  routes.get('/:projectId/feedback', (c) => c.json(listFeedback(db, projectIdOf(db, c))));
  routes.patch('/:projectId/feedback/:feedbackId', (c) => patchFeedback(db, c));
  routes.get('/:projectId/lesson-suggestion', (c) =>
    c.json(latestLessonSuggestion(db, projectIdOf(db, c))),
  );
  routes.post('/:projectId/lesson-suggestion', (c) => suggestLessons(db, c));
  routes.post('/:projectId/lesson-suggestion/:suggestionId/dismiss', (c) =>
    dismissSuggestion(db, c),
  );
  return routes;
}
