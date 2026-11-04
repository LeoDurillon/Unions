// The API route for the board's live progress: what each running agent of a project is doing now.
import { projectRunProgress, type Db } from '@union/core';
import { Hono } from 'hono';

import { requireId } from '../http';

/** `GET /api/projects/:projectId/run-progress`: the runs in progress, each with its agent's latest line. */
export function runProgressRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/run-progress', (c) =>
    c.json(projectRunProgress(db, requireId(c.req.param('projectId'), 'project id'))),
  );
  return routes;
}
