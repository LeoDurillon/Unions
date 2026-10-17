// `/api/tickets/:id/pr-checks`: the pull request's CI checks read from GitHub, the failed ones (with related jobs and bot comments) given to the implementer, a failed Actions job run again.
import {
  CiOutputError,
  dropCiOutput,
  getTicket,
  keepCiOutputs,
  listCiOutputs,
  projectGitHubAuth,
  revisesImplementer,
  schema,
  sendCiOutputs,
  type Db,
  type NewCiOutput,
  type Ticket,
} from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { CiGivenView, CiPreview, PrChecksView, PullRequestChecks } from '../ci-api-types';
import { parsePicks, readPicks, type CiSource } from '../ci-picks';
import { queueRerun } from '../ci-rerun';
import type { CiGitHub } from '../github-checks';
import { ACCEPTED, BAD_GATEWAY, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { guarded } from './github-errors';

const FORBIDDEN = 403;
const DEFAULT_NOTE = 'The CI checks below failed on the pull request; fix what they show.';

type Loaded = { ticket: Ticket; number: number; source: CiSource };

function loadTicket(db: Db, c: Context): Ticket {
  try {
    return getTicket(db, requireId(c.req.param('id'), 'ticket id'));
  } catch {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
}

/** The ticket, its pull request and the credentials to read it. */
function load(db: Db, ci: CiGitHub, c: Context): Loaded {
  const ticket = loadTicket(db, c);
  if (ticket.prNumber === null) {
    throw fail(CONFLICT, 'Link a pull request to this ticket first');
  }
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  const auth = project ? projectGitHubAuth(db, project, process.env.GITHUB_TOKEN) : null;
  if (!project || !auth) {
    throw fail(
      CONFLICT,
      'This project has no GitHub credentials: set a token or a GitHub App in the project settings',
    );
  }
  const repo = { owner: project.owner, repo: project.repo };
  return { ticket, number: ticket.prNumber, source: { ci, auth, repo } };
}

function statusOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
}

/** GitHub's 403 names no permission: say which ones the checks need. */
function readGitHub<T>(work: () => Promise<T>): Promise<T> {
  return guarded(async () => {
    try {
      return await work();
    } catch (error) {
      if (statusOf(error) === FORBIDDEN) {
        throw fail(
          BAD_GATEWAY,
          'GitHub refused to read the checks: the GitHub App needs read access to Checks, Commit statuses and Actions (accepted on its installation), a classic token the repo scope',
        );
      }
      throw error;
    }
  });
}

async function listing(loaded: Loaded): Promise<PullRequestChecks> {
  const { source, number } = loaded;
  const found = await readGitHub(() => source.ci.listChecks(source.auth, source.repo, number));
  if (!found) {
    throw fail(
      NOT_FOUND,
      `${source.repo.owner}/${source.repo.repo} has no pull request #${number}`,
    );
  }
  return found;
}

function checked<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof CiOutputError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
}

function given(db: Db, ticket: Ticket): CiGivenView {
  return { given: listCiOutputs(db, ticket.id) };
}

async function view(db: Db, loaded: Loaded): Promise<PrChecksView> {
  const found = await listing(loaded);
  return {
    ...found,
    number: loaded.number,
    ...given(db, loaded.ticket),
    canSend: revisesImplementer(loaded.ticket.phase),
  };
}

async function picked(
  loaded: Loaded,
  c: Context,
): Promise<{ body: Record<string, unknown>; items: NewCiOutput[] }> {
  const body = await readObject(c.req.raw);
  const picks = parsePicks(body);
  const found = await listing(loaded);
  const items = await readGitHub(() => readPicks(loaded.source, found, picks));
  return { body, items };
}

function noPendingCommand(db: Db, ticket: Ticket): void {
  const pending = db
    .select({ id: schema.commands.id })
    .from(schema.commands)
    .where(and(eq(schema.commands.ticketId, ticket.id), isNull(schema.commands.handledAt)))
    .get();
  if (pending) {
    throw fail(CONFLICT, 'A command for this ticket is still being processed');
  }
}

async function send(db: Db, loaded: Loaded, c: Context): Promise<Response> {
  const { ticket } = loaded;
  if (!revisesImplementer(ticket.phase)) {
    throw fail(CONFLICT, 'The ticket cannot go back to the implementer now');
  }
  noPendingCommand(db, ticket);
  const { body, items } = await picked(loaded, c);
  const note =
    typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : DEFAULT_NOTE;
  checked(() => sendCiOutputs(db, ticket.id, items, note));
  return c.json(given(db, ticket), ACCEPTED);
}

async function rerun(db: Db, loaded: Loaded, c: Context): Promise<Response> {
  const body = await readObject(c.req.raw);
  queueRerun(db, loaded.ticket.id, await listing(loaded), body.checkId);
  return c.json({}, ACCEPTED);
}

/** `/api/tickets/:id/pr-checks`: read from GitHub; a re-run is the worker's write. */
export function prChecksRoutes(db: Db, ci: CiGitHub): Hono {
  const routes = new Hono();
  routes.get('/', async (c) => c.json(await view(db, load(db, ci, c))));
  routes.post('/preview', async (c) => {
    const { items } = await picked(load(db, ci, c), c);
    const preview: CiPreview = { items };
    return c.json(preview);
  });
  routes.post('/keep', async (c) => {
    const loaded = load(db, ci, c);
    const { items } = await picked(loaded, c);
    checked(() => keepCiOutputs(db, loaded.ticket.id, items));
    return c.json(given(db, loaded.ticket));
  });
  routes.post('/send', (c) => send(db, load(db, ci, c), c));
  routes.post('/rerun', (c) => rerun(db, load(db, ci, c), c));
  routes.post('/given/:outputId/drop', (c) => {
    const ticket = loadTicket(db, c);
    checked(() => dropCiOutput(db, ticket.id, requireId(c.req.param('outputId'), 'output id')));
    return c.json(given(db, ticket));
  });
  return routes;
}
