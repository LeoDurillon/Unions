// `/api/projects/:projectId/setup`: the setup agent's latest run and its proposal, and queuing a new run.
import { InvestigationError, latestSetup, queueSetup, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireId } from '../http';

function projectOf(db: Db, c: Context): number {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, `Project ${id} not found`);
  }
  return id;
}

async function start(db: Db, c: Context): Promise<Response> {
  const projectId = projectOf(db, c);
  const { model } = await readObject(c.req.raw);
  if (model !== undefined && typeof model !== 'string') {
    throw fail(BAD_REQUEST, '"model" must be a model name');
  }
  try {
    return c.json(queueSetup(db, projectId, model), CREATED);
  } catch (error) {
    if (error instanceof InvestigationError) {
      throw fail(error.message.startsWith('Unknown model') ? BAD_REQUEST : CONFLICT, error.message);
    }
    throw error;
  }
}

/** The web only queues the run; the worker runs it like any investigation. */
export function setupRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/setup', (c) => c.json(latestSetup(db, projectOf(db, c))));
  routes.post('/:projectId/setup', (c) => start(db, c));
  return routes;
}
