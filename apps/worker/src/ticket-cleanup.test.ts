import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { cleanUpTicket, finishedReason, TicketCleanup, ticketsToClean } from './ticket-cleanup';

let db: Db;
let projectId: number;
let removed: string[];
let previewsRemoved: number[];
let previewBusy: boolean;

const runtime = {
  remove: (name: string, volumes?: { home: string; workspace: string }) => {
    removed.push(name, ...(volumes ? [volumes.home, volumes.workspace] : []));
    return Promise.resolve();
  },
} as unknown as ContainerRuntime;

function deps(): ConstructorParameters<typeof TicketCleanup>[0] {
  return {
    db,
    runtime,
    removePreview: (ticketId) => {
      if (previewBusy) {
        return Promise.resolve(false);
      }
      previewsRemoved.push(ticketId);
      return Promise.resolve(true);
    },
  };
}

/** A ticket with a container, and the given columns. */
function ticket(values: Partial<Ticket>): number {
  const { id } = createTicket(db, { projectId, title: 'Search', body: '' });
  db.update(schema.tickets)
    .set({
      containerName: `union-t${id}`,
      homeVolume: `union-t${id}-home`,
      workspaceVolume: `union-t${id}-ws`,
      ...values,
    })
    .where(eq(schema.tickets.id, id))
    .run();
  return id;
}

function eventTypes(): string[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  removed = [];
  previewsRemoved = [];
  previewBusy = false;
});

test('a merged pull request or a cancelled ticket is finished; Done alone is not', () => {
  expect(finishedReason({ phase: { kind: 'cancelled' }, prState: null })).toBe('cancelled');
  expect(finishedReason({ phase: { kind: 'done' }, prState: 'merged' })).toBe('merged');
  expect(finishedReason({ phase: { kind: 'done' }, prState: 'open' })).toBeNull();
  expect(finishedReason({ phase: { kind: 'done' }, prState: 'closed' })).toBeNull();
});

test('only finished tickets with a container and nothing running are cleaned', () => {
  const merged = ticket({ phase: { kind: 'done' }, prState: 'merged' });
  const cancelled = ticket({ phase: { kind: 'cancelled' } });
  ticket({ phase: { kind: 'done' }, prState: 'open' });
  ticket({ phase: { kind: 'cancelled' }, containerName: null });
  ticket({ phase: { kind: 'running', step: 'rebase' }, prState: 'merged' });
  const reviewed = ticket({ phase: { kind: 'done' }, prState: 'merged' });
  db.insert(schema.agentReviews).values({ ticketId: reviewed, status: 'running' }).run();
  const commanded = ticket({ phase: { kind: 'cancelled' } });
  db.insert(schema.commands).values({ type: 'preview_start', ticketId: commanded }).run();
  expect(ticketsToClean(db).map(({ id, reason }) => [id, reason])).toEqual([
    [merged, 'merged'],
    [cancelled, 'cancelled'],
  ]);
});

test('a cleanup removes the preview, then the container and its volumes, and forgets them', async () => {
  const id = ticket({ phase: { kind: 'done' }, prState: 'merged' });
  const [finished] = ticketsToClean(db);
  expect(finished).toBeDefined();
  if (finished) {
    expect(await cleanUpTicket(deps(), finished)).toBe(true);
  }
  expect(previewsRemoved).toEqual([id]);
  expect(removed).toEqual([`union-t${id}`, `union-t${id}-home`, `union-t${id}-ws`]);
  expect(getTicket(db, id)).toMatchObject({
    containerName: null,
    homeVolume: null,
    workspaceVolume: null,
  });
  expect(eventTypes()).toContain('ticket_workspace_removed');
  expect(ticketsToClean(db)).toEqual([]);
});

test('a busy preview leaves the ticket for the next pass', async () => {
  const id = ticket({ phase: { kind: 'cancelled' } });
  previewBusy = true;
  await new TicketCleanup(deps()).check();
  expect(removed).toEqual([]);
  expect(getTicket(db, id).containerName).toBe(`union-t${id}`);
});

test('a failure is logged once, and the ticket left until the worker restarts', async () => {
  const id = ticket({ phase: { kind: 'cancelled' } });
  const cleanup = new TicketCleanup({
    ...deps(),
    removePreview: () => Promise.reject(new Error('compose down failed')),
  });
  await cleanup.check();
  await cleanup.check();
  const failures = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, 'container_cleanup_failed'))
    .all();
  expect(failures).toHaveLength(1);
  expect(failures[0]?.ticketId).toBe(id);
  expect(getTicket(db, id).containerName).toBe(`union-t${id}`);
});
