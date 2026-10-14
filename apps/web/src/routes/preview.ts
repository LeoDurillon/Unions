import {
  getPreview,
  getTicket,
  schema,
  setComposeOverride,
  type Db,
  type PreviewConfig,
  type Ticket,
} from '@union/core';
import { and, eq, isNull, like } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { PreviewView } from '../api-types';
import { ACCEPTED, BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';

/** A compose file, not a dump: Union's own are a few kilobytes. */
const MAX_COMPOSE_CHARS = 200_000;

function loadTicket(db: Db, c: Context): Ticket {
  try {
    return getTicket(db, requireId(c.req.param('id'), 'ticket id'));
  } catch {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
}

function previewConfig(db: Db, ticket: Ticket): PreviewConfig | undefined {
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  return project?.config.preview;
}

function configured(db: Db, ticket: Ticket): boolean {
  return previewConfig(db, ticket) !== undefined;
}

/** A preview command the worker has not handled yet. */
function pending(db: Db, ticketId: number): boolean {
  const row = db
    .select({ id: schema.commands.id })
    .from(schema.commands)
    .where(
      and(
        eq(schema.commands.ticketId, ticketId),
        like(schema.commands.type, 'preview_%'),
        isNull(schema.commands.handledAt),
      ),
    )
    .get();
  return row !== undefined;
}

function refusal(db: Db, ticket: Ticket): string | null {
  if (!configured(db, ticket)) {
    return 'Set up previews in the project settings (Preview) first.';
  }
  if (!ticket.workspaceVolume) {
    return 'The ticket has no workspace yet: run the implementation first.';
  }
  const status = getPreview(db, ticket.id)?.status;
  return status === 'starting' || status === 'stopping' || pending(db, ticket.id)
    ? 'The preview is already starting or stopping.'
    : null;
}

function view(db: Db, ticket: Ticket): PreviewView {
  return {
    preview: getPreview(db, ticket.id),
    configured: configured(db, ticket),
    composeFile: previewConfig(db, ticket)?.composeFile ?? null,
    refusal: refusal(db, ticket),
  };
}

function command(
  db: Db,
  c: Context,
  type: string,
  check: (ticket: Ticket) => string | null,
): Response {
  const ticket = loadTicket(db, c);
  const reason = check(ticket);
  if (reason !== null) {
    throw fail(CONFLICT, reason);
  }
  db.insert(schema.commands).values({ type, ticketId: ticket.id }).run();
  return c.json(view(db, ticket), ACCEPTED);
}

/** The user's own compose file for the ticket (YAML), or null for the generated one again. */
async function saveOwnFile(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const { yaml } = await readObject(c.req.raw);
  if (yaml !== null && (typeof yaml !== 'string' || yaml.trim() === '')) {
    throw fail(BAD_REQUEST, 'Give the compose file, or null to use the generated one');
  }
  if (typeof yaml === 'string' && yaml.length > MAX_COMPOSE_CHARS) {
    throw fail(BAD_REQUEST, 'The compose file is too long');
  }
  setComposeOverride(db, ticket.id, yaml);
  return c.json(view(db, ticket));
}

/**
 * `/api/tickets/:id/preview`: the ticket's preview and the commands that start, stop and read it
 * (the worker runs them: the web never touches Docker).
 */
export function previewRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(view(db, loadTicket(db, c))));
  routes.post('/start', (c) => command(db, c, 'preview_start', (ticket) => refusal(db, ticket)));
  routes.post('/stop', (c) =>
    command(db, c, 'preview_stop', (ticket) =>
      pending(db, ticket.id) || getPreview(db, ticket.id) === null
        ? 'There is no preview to stop.'
        : null,
    ),
  );
  routes.post('/generate', (c) =>
    command(db, c, 'preview_generate', (ticket) => refusal(db, ticket)),
  );
  routes.put('/compose', (c) => saveOwnFile(db, c));
  routes.post('/logs', (c) =>
    command(db, c, 'preview_logs', (ticket) =>
      getPreview(db, ticket.id)?.status === 'running' ? null : 'The preview is not running.',
    ),
  );
  return routes;
}
