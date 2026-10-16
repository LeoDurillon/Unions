// The API routes for agents: their instructions, models, efforts, tools and connectors.
import {
  addTool,
  AgentToolError,
  isAgentId,
  listAgents,
  listTools,
  AGENT_EFFORTS,
  AGENT_MODELS,
  isAgentEffort,
  isAgentModel,
  removeTool,
  resetAgent,
  saveAgent,
  type AgentEffort,
  type AgentId,
  type AgentModel,
  type Db,
} from '@union/core';
import { Hono, type Context } from 'hono';

import {
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  NOT_FOUND,
  optionalText,
  readObject,
  requireText,
} from '../http';
import { connectorRoutes } from './mcp-connectors';

function agentOf(c: Context): AgentId {
  const agent = c.req.param('agent') ?? '';
  if (!isAgentId(agent)) {
    throw fail(NOT_FOUND, `Unknown agent "${agent}"`);
  }
  return agent;
}

function modelOf(agent: AgentId, body: Record<string, unknown>): AgentModel | null {
  if (agent === 'shared' || agent === 'rebase' || agent === 'simplify') {
    return null;
  }
  const { model } = body;
  if (!isAgentModel(model)) {
    throw fail(BAD_REQUEST, `"model" must be one of ${AGENT_MODELS.join(', ')}`);
  }
  return model;
}

/** Absent or null: the CLI's default effort. */
function effortOf(body: Record<string, unknown>): AgentEffort | null {
  const { effort } = body;
  if (effort === undefined || effort === null) {
    return null;
  }
  if (!isAgentEffort(effort)) {
    throw fail(BAD_REQUEST, `"effort" must be one of ${AGENT_EFFORTS.join(', ')}, or null`);
  }
  return effort;
}

/** Absent: keep the step's default tools. */
function toolsOf(body: Record<string, unknown>): string[] | null {
  const { tools } = body;
  if (tools === undefined || tools === null) {
    return null;
  }
  if (!Array.isArray(tools) || !tools.every((tool) => typeof tool === 'string')) {
    throw fail(BAD_REQUEST, '"tools" must be a list of tool names');
  }
  return tools;
}

/** The core refuses bad tool names and selections; those are the client's to fix. */
function toolErrors<T>(status: typeof BAD_REQUEST | typeof CONFLICT, work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw error instanceof AgentToolError ? fail(status, error.message) : error;
  }
}

function toolRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(listTools(db)));
  routes.post('/', async (c) => {
    const body = await readObject(c.req.raw);
    const input = {
      name: requireText(body, 'name'),
      description: optionalText(body, 'description'),
    };
    return c.json(
      toolErrors(BAD_REQUEST, () => addTool(db, input)),
      CREATED,
    );
  });
  routes.delete('/:name', (c) => {
    toolErrors(CONFLICT, () => {
      removeTool(db, c.req.param('name'));
    });
    return c.json(listTools(db));
  });
  return routes;
}

export function agentRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(listAgents(db)));
  routes.route('/tools', toolRoutes(db));
  routes.route('/connectors', connectorRoutes(db));
  routes.put('/:agent', async (c) => {
    const agent = agentOf(c);
    const body = await readObject(c.req.raw);
    const change = {
      prompt: requireText(body, 'prompt'),
      model: modelOf(agent, body),
      effort: effortOf(body),
      tools: toolsOf(body),
    };
    return c.json(toolErrors(BAD_REQUEST, () => saveAgent(db, agent, change)));
  });
  routes.delete('/:agent', (c) => c.json(resetAgent(db, agentOf(c))));
  return routes;
}
