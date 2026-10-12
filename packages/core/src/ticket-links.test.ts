import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from './db';
import * as schema from './schema';
import { setParent, ticketBase, TicketLinkError } from './ticket-links';
import { createTicket, dispatch, getTicket, StartBlocked } from './tickets';

let db: Db;
let projectId: number;

function addProject(repo: string): number {
  return db
    .insert(schema.projects)
    .values({ owner: 'o', repo, githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
}

function addTicket(title: string, project = projectId): number {
  return createTicket(db, { projectId: project, title }).id;
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = addProject('r');
});

test('a child cannot start until its parent is done', () => {
  const parent = addTicket('parent');
  const child = addTicket('child');
  setParent(db, child, parent);
  expect(() => dispatch(db, child, { type: 'start' })).toThrow(StartBlocked);
  expect(getTicket(db, child).phase).toEqual({ kind: 'backlog' });

  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, parent))
    .run();
  dispatch(db, child, { type: 'start' });
  expect(getTicket(db, child).phase).toEqual({ kind: 'running', step: 'intake' });
});

test('links refuse self, other projects, cycles and started tickets', () => {
  const first = addTicket('first');
  const second = addTicket('second');
  const elsewhere = addTicket('elsewhere', addProject('other'));
  expect(() => setParent(db, first, first)).toThrow(TicketLinkError);
  expect(() => setParent(db, first, elsewhere)).toThrow(TicketLinkError);
  setParent(db, second, first);
  expect(() => setParent(db, first, second)).toThrow(TicketLinkError);

  dispatch(db, first, { type: 'start' });
  expect(() => setParent(db, first, null)).toThrow(TicketLinkError);
  expect(setParent(db, second, null).parentTicketId).toBeNull();
});

test('deleting the parent unlinks the child; the base falls back to the project branch', () => {
  const parent = addTicket('parent');
  const child = addTicket('child');
  setParent(db, child, parent);
  db.delete(schema.tickets).where(eq(schema.tickets.id, parent)).run();
  const ticket = getTicket(db, child);
  expect(ticket.parentTicketId).toBeNull();
  const project = db.select().from(schema.projects).get();
  if (!project) {
    throw new Error('no project');
  }
  expect(ticketBase(project, ticket)).toBe('main');
  expect(ticketBase(project, { ...ticket, baseBranch: '12-parent' })).toBe('12-parent');
});
