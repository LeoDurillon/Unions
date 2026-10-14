import {
  askFollowUp,
  createInvestigation,
  deleteInvestigation,
  getInvestigation,
  InvestigationError,
  isInvestigationScope,
  listInvestigations,
  requestTicket,
  rerunInvestigation,
  schema,
  AgentToolError,
  type Db,
  type Investigation,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import {
  ACCEPTED,
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  NOT_FOUND,
  readObject,
  requireId,
  requireText,
} from '../http';

/** Not found is a 404; any other refusal is the given status. */
function refusals<T>(status: typeof BAD_REQUEST | typeof CONFLICT, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof InvestigationError && error.message.endsWith('not found')) {
      throw fail(NOT_FOUND, error.message);
    }
    if (error instanceof InvestigationError || error instanceof AgentToolError) {
      throw fail(status, error.message);
    }
    throw error;
  }
}

function projectOf(db: Db, c: Context): number {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, `Project ${id} not found`);
  }
  return id;
}

/** The investigation in the URL, which must belong to the project in the URL. */
function investigationOf(db: Db, c: Context): Investigation {
  const projectId = projectOf(db, c);
  const id = requireId(c.req.param('id'), 'investigation id');
  const investigation = refusals(BAD_REQUEST, () => getInvestigation(db, id));
  if (investigation.projectId !== projectId) {
    throw fail(NOT_FOUND, `Investigation ${id} not found`);
  }
  return investigation;
}

function toolsOf(body: Record<string, unknown>): string[] {
  const { tools } = body;
  if (!Array.isArray(tools) || !tools.every((tool) => typeof tool === 'string')) {
    throw fail(BAD_REQUEST, '"tools" must be a list of tool names');
  }
  return tools;
}

async function create(db: Db, c: Context): Promise<Response> {
  const body = await readObject(c.req.raw);
  const { scope, model } = body;
  if (!isInvestigationScope(scope)) {
    throw fail(BAD_REQUEST, '"scope" must be "global", "repository" or "ticket"');
  }
  const input = {
    projectId: projectOf(db, c),
    title: requireText(body, 'title'),
    prompt: requireText(body, 'prompt'),
    scope,
    onTicketId: typeof body.onTicketId === 'number' ? body.onTicketId : null,
    model: typeof model === 'string' ? model : '',
    tools: toolsOf(body),
  };
  return c.json(
    refusals(BAD_REQUEST, () => createInvestigation(db, input)),
    CREATED,
  );
}

/**
 * `/api/projects/:projectId/investigations`: one agent run on the user's prompt, with no GitHub
 * issue. The web only writes the records; the worker runs them and handles cancellation.
 */
export function investigationRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(listInvestigations(db, projectOf(db, c))));
  routes.post('/', (c) => create(db, c));
  routes.get('/:id', (c) => c.json(investigationOf(db, c)));
  routes.post('/:id/rerun', (c) => {
    const { id } = investigationOf(db, c);
    return c.json(refusals(CONFLICT, () => rerunInvestigation(db, id)));
  });
  routes.post('/:id/follow-up', async (c) => {
    const { id } = investigationOf(db, c);
    const prompt = requireText(await readObject(c.req.raw), 'prompt');
    return c.json(refusals(CONFLICT, () => askFollowUp(db, id, prompt)));
  });
  routes.post('/:id/ticket', async (c) => {
    const { id } = investigationOf(db, c);
    const { context } = await readObject(c.req.raw);
    const text = typeof context === 'string' ? context : '';
    return c.json(
      refusals(CONFLICT, () => requestTicket(db, id, text)),
      ACCEPTED,
    );
  });
  routes.post('/:id/cancel', (c) => {
    const { id, status } = investigationOf(db, c);
    if (status !== 'queued' && status !== 'running') {
      throw fail(CONFLICT, 'The investigation has already finished');
    }
    const command = db
      .insert(schema.commands)
      .values({ type: 'cancel_investigation', payload: { investigationId: id } })
      .returning()
      .get();
    return c.json(command, ACCEPTED);
  });
  routes.delete('/:id', (c) => {
    const { id } = investigationOf(db, c);
    refusals(CONFLICT, () => {
      deleteInvestigation(db, id);
    });
    return c.json({ id });
  });
  return routes;
}
