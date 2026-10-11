import {
  isAgentId,
  listAgents,
  AGENT_MODELS,
  isAgentModel,
  resetAgent,
  saveAgent,
  type AgentId,
  type AgentModel,
  type Db,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, fail, NOT_FOUND, readObject, requireText } from '../http';

function agentOf(c: Context): AgentId {
  const agent = c.req.param('agent') ?? '';
  if (!isAgentId(agent)) {
    throw fail(NOT_FOUND, `Unknown agent "${agent}"`);
  }
  return agent;
}

function modelOf(agent: AgentId, body: Record<string, unknown>): AgentModel | null {
  if (agent === 'shared' || agent === 'rebase') {
    return null;
  }
  const { model } = body;
  if (!isAgentModel(model)) {
    throw fail(BAD_REQUEST, `"model" must be one of ${AGENT_MODELS.join(', ')}`);
  }
  return model;
}

export function agentRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(listAgents(db)));
  routes.put('/:agent', async (c) => {
    const agent = agentOf(c);
    const body = await readObject(c.req.raw);
    return c.json(
      saveAgent(db, agent, { prompt: requireText(body, 'prompt'), model: modelOf(agent, body) }),
    );
  });
  routes.delete('/:agent', (c) => c.json(resetAgent(db, agentOf(c))));
  return routes;
}
