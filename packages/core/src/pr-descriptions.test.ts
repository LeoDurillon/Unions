import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from './db';
import { prDescriptionOutdated } from './pr-description-outdated';
import {
  claimPrDescription,
  discardPrDescription,
  finishPrDescription,
  finishSendingPrDescription,
  getPrDescription,
  latestPrDescription,
  queuePrDescription,
  recoverPrDescriptions,
  startSendingPrDescription,
  withoutUnionLinks,
} from './pr-descriptions';
import * as schema from './tables';
import { createTicket, emitEvent } from './tickets';

let db: Db;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
  db.update(schema.tickets).set({ prNumber: 9 }).where(eq(schema.tickets.id, ticketId)).run();
});

function ready(text = 'New description'): number {
  const row = queuePrDescription(db, ticketId);
  claimPrDescription(db);
  finishPrDescription(db, row.id, { status: 'ready', original: 'Old\n\nCloses #3', text });
  return row.id;
}

test('one rewrite at a time; a new one replaces the unsent draft', () => {
  const first = queuePrDescription(db, ticketId);
  expect(() => queuePrDescription(db, ticketId)).toThrow('already being rewritten');
  expect(claimPrDescription(db)?.id).toBe(first.id);
  finishPrDescription(db, first.id, { status: 'ready', original: 'Old', text: 'New' });
  const second = queuePrDescription(db, ticketId);
  expect(getPrDescription(db, first.id)?.status).toBe('discarded');
  expect(latestPrDescription(db, ticketId)?.id).toBe(second.id);
});

test('a ticket without a pull request has nothing to rewrite', () => {
  db.update(schema.tickets).set({ prNumber: null }).run();
  expect(() => queuePrDescription(db, ticketId)).toThrow('no pull request');
});

test('a draft is sent as the user edited it; a conflict cannot be sent', () => {
  const id = ready();
  expect(() => startSendingPrDescription(db, id, '  ')).toThrow('empty');
  expect(startSendingPrDescription(db, id, 'Edited').text).toBe('Edited');
  // Sending: neither a second send nor a new rewrite.
  expect(() => startSendingPrDescription(db, id, 'Again')).toThrow();
  expect(() => queuePrDescription(db, ticketId)).toThrow();
  finishSendingPrDescription(db, id, { status: 'failed', error: 'GitHub is down' });
  expect(getPrDescription(db, id)).toMatchObject({ status: 'ready', error: 'GitHub is down' });

  startSendingPrDescription(db, id, 'Edited');
  finishSendingPrDescription(db, id, { status: 'conflict' });
  expect(getPrDescription(db, id)?.status).toBe('conflict');
  expect(() => startSendingPrDescription(db, id, 'Edited')).toThrow('rewrite it again');
  discardPrDescription(db, id);
  expect(getPrDescription(db, id)?.status).toBe('discarded');
});

test('a stopped worker fails the rewrite it was running and returns a send to its draft', () => {
  const running = queuePrDescription(db, ticketId);
  claimPrDescription(db);
  recoverPrDescriptions(db);
  expect(getPrDescription(db, running.id)?.status).toBe('failed');
  const id = ready();
  startSendingPrDescription(db, id, 'Edited');
  recoverPrDescriptions(db);
  expect(getPrDescription(db, id)).toMatchObject({ status: 'ready', text: 'Edited' });
});

test('the description is outdated once the branch is pushed after it was written', () => {
  expect(prDescriptionOutdated(db, ticketId)).toBe(false);
  const at = (type: 'branch_pushed' | 'pull_request_opened', time: number): void => {
    emitEvent(
      db,
      type === 'branch_pushed'
        ? { type, ticketId, payload: { branch: 'b' } }
        : { type, ticketId, payload: { number: 1, url: '' } },
    );
    db.update(schema.events).set({ at: time }).where(eq(schema.events.type, type)).run();
  };
  at('branch_pushed', 1000);
  at('pull_request_opened', 1001);
  expect(prDescriptionOutdated(db, ticketId)).toBe(false);
  at('branch_pushed', 2000);
  expect(prDescriptionOutdated(db, ticketId)).toBe(true);
  const id = ready();
  startSendingPrDescription(db, id, 'Edited');
  finishSendingPrDescription(db, id, { status: 'sent' });
  expect(prDescriptionOutdated(db, ticketId)).toBe(false);
});

test("Union's links are not part of the description", () => {
  expect(
    withoutUnionLinks(
      'Summary\r\n\r\nCloses #12\n\nBuilds on #4, which it targets: merge that one first.',
    ),
  ).toBe('Summary');
  expect(withoutUnionLinks('Closes #12 and more')).toBe('Closes #12 and more');
});

function split(): void {
  const slices = [
    { position: 1, prNumber: 5, prState: 'merged' as const },
    { position: 2, prNumber: 6, prState: 'open' as const },
    { position: 3, prNumber: 9, prState: 'open' as const },
  ];
  for (const slice of slices) {
    db.insert(schema.ticketSlices)
      .values({
        ticketId,
        title: 't',
        spec: 's',
        tipSha: 'a',
        branch: `b${slice.position}`,
        ...slice,
      })
      .run();
  }
}

test("a split ticket's rewrite covers each open slice, one run at a time", () => {
  split();
  const own = queuePrDescription(db, ticketId);
  expect(own.prNumber).toBe(9);
  const queued = db.select().from(schema.prDescriptions).all();
  expect(queued.map((row) => [row.prNumber, row.status])).toEqual([
    [6, 'queued'],
    [9, 'queued'],
  ]);
  const first = claimPrDescription(db);
  expect(first?.prNumber).toBe(6);
  expect(claimPrDescription(db)).toBeNull();
  finishPrDescription(db, first?.id ?? 0, { status: 'ready', original: 'Old', text: 'New' });
  expect(claimPrDescription(db)?.prNumber).toBe(9);
  expect(latestPrDescription(db, ticketId, 6)?.status).toBe('ready');
  expect(latestPrDescription(db, ticketId, 9)?.status).toBe('running');
});

test("a slice's stack list and the top's stack section are not part of the description", () => {
  const lower =
    'Moves the module.\n\n**Stack**, bottom first: merge from the bottom.\n\n1. **#5 A** (this pull request)\n\nPart of #3.';
  expect(withoutUnionLinks(lower)).toBe('Moves the module.');
  const top =
    'Adds search.\n\nCloses #3\n\n<!-- union:stack -->\n**Stack**, bottom first: merge from the bottom.\n\n1. #5 A\n<!-- /union:stack -->';
  expect(withoutUnionLinks(top)).toBe('Adds search.');
});
