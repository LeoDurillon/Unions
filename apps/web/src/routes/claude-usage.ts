// The API routes for Claude usage: how much of the subscription's windows is used, and what a
// project's agents used, with its API-equivalent cost.
import { latestClaudeLimits, projectUsage, type Db } from '@union/core';
import { Hono } from 'hono';

import { BAD_REQUEST, fail, requireId } from '../http';

/** The ranges the Usage page offers, in days; `all` is everything. */
const RANGES = new Set(['7', '30', '90', 'all']);

function daysOf(range = '30'): number | null {
  if (!RANGES.has(range)) {
    throw fail(BAD_REQUEST, '"days" must be 7, 30, 90 or all');
  }
  return range === 'all' ? null : Number(range);
}

/**
 * `GET /api/claude-limits`: the newest usage report of the subscription (null before any).
 * `GET /api/projects/:projectId/usage?days=7|30|90|all`: the project's usage over that range.
 */
export function claudeUsageRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/claude-limits', (c) => c.json(latestClaudeLimits(db)));
  routes.get('/projects/:projectId/usage', (c) =>
    c.json(
      projectUsage(
        db,
        requireId(c.req.param('projectId'), 'project id'),
        daysOf(c.req.query('days')),
      ),
    ),
  );
  return routes;
}
