// The API routes for Claude usage: how much of the subscription's windows is used, what a project's
// agents used, with its API-equivalent cost, what that shows to improve, and asking an agent about it.
import {
  InvestigationError,
  latestClaudeLimits,
  projectFindings,
  projectUsage,
  suggestImprovements,
  type Db,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, CREATED, fail, requireId } from '../http';

/** The ranges the Usage page offers, in days; `all` is everything. */
const RANGES = new Set(['7', '30', '90', 'all']);

function daysOf(range = '30'): number | null {
  if (!RANGES.has(range)) {
    throw fail(BAD_REQUEST, '"days" must be 7, 30, 90 or all');
  }
  return range === 'all' ? null : Number(range);
}

/** The project and the range a request names. */
function scope(c: Context): [number, number | null] {
  return [requireId(c.req.param('projectId'), 'project id'), daysOf(c.req.query('days'))];
}

/**
 * `GET /api/claude-limits`: the newest usage report of the subscription (null before any).
 * `GET /api/projects/:projectId/usage?days=7|30|90|all`: the project's usage over that range.
 * `GET /api/projects/:projectId/usage/findings?days=…`: what that usage shows to improve.
 * `POST /api/projects/:projectId/usage/suggestions?days=…`: queues an investigation asking an agent
 * what to change for those findings; answers its id.
 */
export function claudeUsageRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/claude-limits', (c) => c.json(latestClaudeLimits(db)));
  routes.get('/projects/:projectId/usage', (c) => c.json(projectUsage(db, ...scope(c))));
  routes.get('/projects/:projectId/usage/findings', (c) =>
    c.json(projectFindings(db, ...scope(c))),
  );
  routes.post('/projects/:projectId/usage/suggestions', (c) => {
    try {
      return c.json({ id: suggestImprovements(db, ...scope(c)).id }, CREATED);
    } catch (error) {
      if (error instanceof InvestigationError) {
        throw fail(BAD_REQUEST, error.message);
      }
      throw error;
    }
  });
  return routes;
}
