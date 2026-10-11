import { schema, type Db, type Project, type ProjectConfig } from '@union/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Context } from 'hono';

import { toPublicProject } from '../api-types';
import {
  BAD_REQUEST,
  CONFLICT,
  fail,
  NOT_FOUND,
  optionalText,
  readObject,
  requireId,
} from '../http';
import { requireNotionId } from './notion';

const NO_CONTENT = 204;

function loadProject(db: Db, c: Context): Project {
  const id = requireId(c.req.param('id'), 'project id');
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!project) {
    throw fail(NOT_FOUND, `Project ${id} not found`);
  }
  return project;
}

const MAX_ITERATIONS = 10;
const CHECK_FIELDS = ['installCommand', 'gateCommand'] as const;

/** A present key with an empty string clears the command; an absent key leaves it unchanged. */
function commandChange(
  body: Record<string, unknown>,
  key: (typeof CHECK_FIELDS)[number],
  current: string | undefined,
): string | undefined {
  if (!(key in body)) {
    return current;
  }
  const value = body[key];
  if (typeof value !== 'string') {
    throw fail(BAD_REQUEST, `"${key}" must be a string`);
  }
  return value.trim() === '' ? undefined : value.trim();
}

function iterationsChange(
  body: Record<string, unknown>,
  current: number | undefined,
): number | undefined {
  if (!('maxIterations' in body)) {
    return current;
  }
  const value = Number(body.maxIterations);
  if (!Number.isInteger(value) || value < 1 || value > MAX_ITERATIONS) {
    throw fail(BAD_REQUEST, `"maxIterations" must be a whole number from 1 to ${MAX_ITERATIONS}`);
  }
  return value;
}

const MAX_PATTERNS = 100;

function booleanChange(
  body: Record<string, unknown>,
  key: string,
  current: boolean | undefined,
): boolean | undefined {
  if (!(key in body)) {
    return current;
  }
  if (typeof body[key] !== 'boolean') {
    throw fail(BAD_REQUEST, `"${key}" must be true or false`);
  }
  return body[key];
}

function patternsChange(
  body: Record<string, unknown>,
  current: string[] | undefined,
): string[] | undefined {
  if (!('reviewIgnore' in body)) {
    return current;
  }
  const { reviewIgnore } = body;
  if (!Array.isArray(reviewIgnore) || !reviewIgnore.every((item) => typeof item === 'string')) {
    throw fail(BAD_REQUEST, '"reviewIgnore" must be a list of patterns');
  }
  const patterns = reviewIgnore.map((item: string) => item.trim()).filter((item) => item !== '');
  if (patterns.length > MAX_PATTERNS) {
    throw fail(BAD_REQUEST, `At most ${MAX_PATTERNS} ignore patterns`);
  }
  return patterns;
}

/** A present key with an empty string disconnects; otherwise the ID must parse. */
function dataSourceChange(
  body: Record<string, unknown>,
  current: string | undefined,
): string | undefined {
  if (!('notionDataSourceId' in body)) {
    return current;
  }
  return body.notionDataSourceId === ''
    ? undefined
    : requireNotionId(body, 'notionDataSourceId', 'data source');
}

function notionTokenChange(body: Record<string, unknown>, current: string | null): string | null {
  if (!('notionToken' in body)) {
    return current;
  }
  return optionalText(body, 'notionToken') ?? null;
}

function configChange(project: Project, body: Record<string, unknown>): ProjectConfig {
  const { config } = project;
  return {
    ...config,
    createPullRequest: booleanChange(body, 'createPullRequest', config.createPullRequest),
    hideLockFiles: booleanChange(body, 'hideLockFiles', config.hideLockFiles),
    reviewIgnore: patternsChange(body, config.reviewIgnore),
    notionDataSourceId: dataSourceChange(body, config.notionDataSourceId),
    baseBranch: optionalText(body, 'baseBranch') ?? config.baseBranch,
    installCommand: commandChange(body, 'installCommand', config.installCommand),
    gateCommand: commandChange(body, 'gateCommand', config.gateCommand),
    maxIterations: iterationsChange(body, config.maxIterations),
  };
}

const UPDATABLE = [
  'token',
  'baseBranch',
  'maxIterations',
  'createPullRequest',
  'hideLockFiles',
  'reviewIgnore',
  'notionToken',
  'notionDataSourceId',
  ...CHECK_FIELDS,
];

/** Updates the token, base branch and checks. Omitted fields are left as they are. */
export async function updateProject(db: Db, c: Context): Promise<Response> {
  const project = loadProject(db, c);
  const body = await readObject(c.req.raw);
  if (!UPDATABLE.some((key) => key in body)) {
    throw fail(BAD_REQUEST, `Nothing to update: give one of ${UPDATABLE.join(', ')}`);
  }
  const updated = db
    .update(schema.projects)
    .set({
      githubToken: optionalText(body, 'token') ?? project.githubToken,
      notionToken: notionTokenChange(body, project.notionToken),
      config: configChange(project, body),
    })
    .where(eq(schema.projects.id, project.id))
    .returning()
    .get();
  return c.json(toPublicProject(updated));
}

/**
 * Deletes the project and, by cascade, its tickets, runs and outputs. GitHub is left untouched.
 * The web never calls Docker, so the tickets' containers are handed to the worker to remove.
 */
export function deleteProject(db: Db, c: Context): Response {
  const project = loadProject(db, c);
  const tickets = db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.projectId, project.id))
    .all();
  if (tickets.some((ticket) => ticket.phase.kind === 'running')) {
    throw fail(
      CONFLICT,
      'An agent is running on one of this project’s tickets. Wait for it or cancel it first.',
    );
  }
  const containers = tickets.flatMap((ticket) =>
    ticket.containerName && ticket.homeVolume && ticket.workspaceVolume
      ? [{ name: ticket.containerName, home: ticket.homeVolume, workspace: ticket.workspaceVolume }]
      : [],
  );
  const ticketIds = tickets.map((ticket) => ticket.id);
  db.transaction((tx) => {
    if (ticketIds.length > 0) {
      tx.delete(schema.commands)
        .where(and(inArray(schema.commands.ticketId, ticketIds), isNull(schema.commands.handledAt)))
        .run();
    }
    if (containers.length > 0) {
      tx.insert(schema.commands)
        .values({ type: 'remove_containers', payload: { containers } })
        .run();
    }
    tx.delete(schema.projects).where(eq(schema.projects.id, project.id)).run();
  });
  return c.body(null, NO_CONTENT);
}
