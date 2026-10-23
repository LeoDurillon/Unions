// `/api/tickets/:id/preview`: the ticket's preview and the commands that start, stop and read it
// (the worker runs them: the web never touches Docker).
import { getTicket, setComposeOverride, type Db, type Ticket } from '@union/core';
import { Hono, type Context } from 'hono';

import type { PreviewView } from '../api-types';
import { ACCEPTED, CONFLICT, fail, NOT_FOUND, requireId } from '../http';
import {
  e2eRefusal,
  logsRefusal,
  previewRefusal,
  previewView,
  queuePreviewCommand,
  readOwnFile,
  stopRefusal,
  type PreviewSubject,
} from './preview-subject';

function loadTicket(db: Db, c: Context): Ticket {
  try {
    return getTicket(db, requireId(c.req.param('id'), 'ticket id'));
  } catch {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
}

/** The ticket's workspace exists once its first implementation ran; the agent shares the container. */
function subjectOf(ticket: Ticket): PreviewSubject {
  return {
    owner: { ticketId: ticket.id },
    projectId: ticket.projectId,
    noWorkspace: ticket.workspaceVolume
      ? null
      : 'The ticket has no workspace yet: run the implementation first.',
    e2eBusy:
      ticket.phase.kind === 'running'
        ? 'Wait for the current run to finish: the tests run in the same container.'
        : null,
  };
}

function view(db: Db, ticket: Ticket): PreviewView {
  return previewView(db, subjectOf(ticket));
}

function command(
  db: Db,
  c: Context,
  type: string,
  check: (subject: PreviewSubject) => string | null,
): Response {
  const ticket = loadTicket(db, c);
  const reason = check(subjectOf(ticket));
  if (reason !== null) {
    throw fail(CONFLICT, reason);
  }
  queuePreviewCommand(db, { ticketId: ticket.id }, type);
  return c.json(view(db, ticket), ACCEPTED);
}

/** The user's own compose file for the ticket (YAML), or null for the generated one again. */
async function saveOwnFile(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  setComposeOverride(db, { ticketId: ticket.id }, await readOwnFile(c));
  return c.json(view(db, ticket));
}

/**
 * `/api/tickets/:id/preview`: the ticket's preview and the commands that start, stop and read it
 * (the worker runs them: the web never touches Docker).
 */
export function previewRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(view(db, loadTicket(db, c))));
  routes.post('/start', (c) => command(db, c, 'preview_start', (s) => previewRefusal(db, s)));
  routes.post('/stop', (c) => command(db, c, 'preview_stop', (s) => stopRefusal(db, s.owner)));
  routes.post('/e2e', (c) => command(db, c, 'preview_e2e', (s) => e2eRefusal(db, s)));
  routes.post('/generate', (c) => command(db, c, 'preview_generate', (s) => previewRefusal(db, s)));
  routes.put('/compose', (c) => saveOwnFile(db, c));
  routes.post('/logs', (c) => command(db, c, 'preview_logs', (s) => logsRefusal(db, s.owner)));
  return routes;
}
