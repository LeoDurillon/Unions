// `/api/claude-token`: the long-lived Claude token the agents run with: whether one is set, saving and removing it.
import {
  claudeTokenProblem,
  claudeTokenStatus,
  deleteClaudeToken,
  queueConnectorCheck,
  saveClaudeToken,
  type Db,
} from '@union/core';
import { Hono } from 'hono';

import { BAD_REQUEST, fail, readObject, requireText } from '../http';

/**
 * `/api/claude-token`: the token itself is never sent back, only whether one is set. Saving or
 * removing it reads the connectors again, as the agents now reach them with the other login.
 */
export function claudeTokenRoutes(db: Db): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(claudeTokenStatus(db)));

  routes.put('/', async (c) => {
    const token = requireText(await readObject(c.req.raw), 'token').trim();
    const problem = claudeTokenProblem(token);
    if (problem !== null) {
      throw fail(BAD_REQUEST, problem);
    }
    saveClaudeToken(db, token);
    queueConnectorCheck(db);
    return c.json(claudeTokenStatus(db));
  });

  routes.delete('/', (c) => {
    deleteClaudeToken(db);
    queueConnectorCheck(db);
    return c.json(claudeTokenStatus(db));
  });

  return routes;
}
