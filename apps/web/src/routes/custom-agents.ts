// The API routes for custom agents: create one (the worker writes its prompt), rename it, rewrite its role, regenerate, delete.
import {
  createCustomAgent,
  CustomAgentError,
  customAgentNames,
  customStep,
  deleteCustomAgent,
  editCustomAgent,
  regenerateCustomAgent,
  resolveAgent,
  type AgentConfig,
  type Db,
} from '@union/core';
import { Hono } from 'hono';

import { BAD_REQUEST, CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireId } from '../http';

const NO_CONTENT = 204;

const STATUS = { invalid: BAD_REQUEST, not_found: NOT_FOUND, conflict: CONFLICT } as const;

/** Runs `work`, answering the core's refusals with their status. */
function refusals<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw error instanceof CustomAgentError ? fail(STATUS[error.reason], error.message) : error;
  }
}

/** A text field of the body: absent is undefined, anything but text is refused. */
function textOf(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value !== undefined && typeof value !== 'string') {
    throw fail(BAD_REQUEST, `"${key}" must be text`);
  }
  return value;
}

/** The agent as `GET /api/agents` lists it. */
function configOf(db: Db, id: number): AgentConfig {
  return resolveAgent(db, customStep(id));
}

export function customAgentRoutes(db: Db): Hono {
  const routes = new Hono();
  /** Every custom agent's name by step, deleted ones included: finished tickets keep their tabs. */
  routes.get('/names', (c) => c.json(customAgentNames(db)));
  routes.post('/', async (c) => {
    const body = await readObject(c.req.raw);
    const input = { name: textOf(body, 'name') ?? '', role: textOf(body, 'role') ?? '' };
    const agent = refusals(() => createCustomAgent(db, input));
    return c.json(configOf(db, agent.id), CREATED);
  });
  routes.patch('/:id', async (c) => {
    const id = requireId(c.req.param('id'), 'agent id');
    const body = await readObject(c.req.raw);
    const change = { name: textOf(body, 'name'), role: textOf(body, 'role') };
    refusals(() => editCustomAgent(db, id, change));
    return c.json(configOf(db, id));
  });
  routes.post('/:id/regenerate', (c) => {
    const id = requireId(c.req.param('id'), 'agent id');
    refusals(() => regenerateCustomAgent(db, id));
    return c.json(configOf(db, id));
  });
  routes.delete('/:id', (c) => {
    const id = requireId(c.req.param('id'), 'agent id');
    refusals(() => deleteCustomAgent(db, id));
    return c.body(null, NO_CONTENT);
  });
  return routes;
}
