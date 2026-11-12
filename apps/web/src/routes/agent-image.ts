// `/api/projects/:projectId/agent-image`: the image the project's agents run on, a new one saved,
// or the save dropped. The worker builds a saved image; the default image's Dockerfile can also be
// read.
import path from 'node:path';

import {
  AgentImageError,
  discardPendingAgentImage,
  parseAgentImageSource,
  readAgentImage,
  saveAgentImage,
  schema,
  type AgentImageRow,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, fail, NOT_FOUND, readObject, requireId } from '../http';

/** What the settings page shows: the row, or the base image when the project never set one. */
export type AgentImageView = Omit<AgentImageRow, 'projectId'>;

const NONE: AgentImageView = {
  applied: null,
  pending: null,
  status: 'idle',
  error: null,
  output: '',
  savedAt: 0,
  startedAt: null,
  finishedAt: null,
};

/** The Dockerfile the default images are built from, in Union's own checkout. */
const DEFAULT_DOCKERFILE = path.resolve(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'docker',
  'agent.Dockerfile',
);

/** What the default image holds, shown read-only; null when the file cannot be read. */
export type DefaultDockerfileView = { dockerfile: string | null };

async function defaultDockerfile(): Promise<DefaultDockerfileView> {
  try {
    return { dockerfile: await Bun.file(DEFAULT_DOCKERFILE).text() };
  } catch {
    return { dockerfile: null };
  }
}

function projectId(db: Db, c: Context): number {
  const id = requireId(c.req.param('projectId'), 'project id');
  const project = db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  return project.id;
}

function viewOf(row: AgentImageRow | null): AgentImageView {
  if (!row) {
    return NONE;
  }
  const { projectId: _id, ...view } = row;
  return view;
}

/**
 * `/api/projects/:projectId/agent-image`: the image the project's agents run on. A save is pending
 * until the worker built and checked it; deleting the build drops the save, not the applied image.
 */
export function agentImageRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/:projectId/agent-image', (c) =>
    c.json(viewOf(readAgentImage(db, projectId(db, c)))),
  );
  routes.get('/:projectId/agent-image/default', async (c) => {
    projectId(db, c);
    return c.json(await defaultDockerfile());
  });
  routes.put('/:projectId/agent-image', async (c) => {
    const id = projectId(db, c);
    const body = await readObject(c.req.raw);
    try {
      return c.json(viewOf(saveAgentImage(db, id, parseAgentImageSource(body))));
    } catch (error) {
      if (error instanceof AgentImageError) {
        throw fail(BAD_REQUEST, error.message);
      }
      throw error;
    }
  });
  routes.delete('/:projectId/agent-image/pending', (c) => {
    const id = projectId(db, c);
    return c.json(viewOf(discardPendingAgentImage(db, id)));
  });
  return routes;
}
