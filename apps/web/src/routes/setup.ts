// `/api/projects/:projectId/setup`: the setup agent's latest run and proposal, a new run, and testing its values again.
import {
  InvestigationError,
  latestSetup,
  MAX_COMMAND_CHARS,
  previewSecretNames,
  queueSetup,
  queueSetupCheck,
  schema,
  type Db,
  type SetupCheckInput,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, CONFLICT, CREATED, fail, NOT_FOUND, readObject, requireId } from '../http';
import { previewConfig } from './preview-settings';

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

function command(body: Record<string, unknown>, key: 'installCommand' | 'gateCommand'): string {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.length > MAX_COMMAND_CHARS) {
    throw fail(
      BAD_REQUEST,
      `"${key}" must be a command of at most ${MAX_COMMAND_CHARS} characters`,
    );
  }
  return value.trim();
}

/** The values to test, checked as their settings page checks them. */
function checkInput(db: Db, projectId: number, body: Record<string, unknown>): SetupCheckInput {
  if (body.kind === 'checks') {
    const input = {
      kind: 'checks' as const,
      installCommand: command(body, 'installCommand'),
      gateCommand: command(body, 'gateCommand'),
    };
    if (input.installCommand === '' && input.gateCommand === '') {
      throw fail(BAD_REQUEST, 'Give an install or a check command to test');
    }
    return input;
  }
  if (body.kind === 'preview') {
    const preview = previewConfig(body, previewSecretNames(db, projectId));
    if (!preview) {
      throw fail(BAD_REQUEST, 'Give the preview settings to test');
    }
    return { kind: 'preview', preview };
  }
  throw fail(BAD_REQUEST, '"kind" must be "checks" or "preview"');
}

/** Test again: the worker checks these values, on the latest setup run's cards. */
async function test(db: Db, c: Context): Promise<Response> {
  const projectId = projectOf(db, c);
  const setup = latestSetup(db, projectId);
  if (setup?.investigation.status !== 'succeeded') {
    throw fail(CONFLICT, 'The setup agent has no proposal to test');
  }
  const input = checkInput(db, projectId, await readObject(c.req.raw));
  return c.json(queueSetupCheck(db, setup.investigation.id, input), CREATED);
}

/** The web only queues the runs and the checks; the worker runs them. */
export function setupRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/setup', (c) => c.json(latestSetup(db, projectOf(db, c))));
  routes.post('/:projectId/setup', (c) => start(db, c));
  routes.post('/:projectId/setup/checks', (c) => test(db, c));
  return routes;
}
