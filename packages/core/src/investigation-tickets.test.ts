import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import { saveNotionConnection } from './integrations/notion-integration';
import {
  claimTicketDraft,
  failInterruptedTicketDrafts,
  finishTicketDraft,
  requestTicket,
} from './investigation-tickets';
import {
  claimInvestigation,
  createInvestigation,
  deleteInvestigation,
  finishInvestigation,
  getInvestigation,
} from './investigations';
import * as schema from './schema';
import { getTicket } from './tickets';

let db: Db;
let id: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ({ id } = createInvestigation(db, {
    projectId: project.id,
    title: 'Slow login',
    prompt: 'Why is login slow?',
    scope: 'repository',
    model: 'sonnet',
    tools: ['Read'],
  }));
});

function answer(): void {
  claimInvestigation(db);
  finishInvestigation(db, id, { status: 'succeeded', result: 'An N+1 query.' });
}

test('a ticket is asked from an answered investigation only, one at a time', () => {
  expect(() => requestTicket(db, id, '')).toThrow('Only an answered investigation');
  answer();
  expect(requestTicket(db, id, ' Backend only ')).toMatchObject({
    ticketStatus: 'queued',
    ticketContext: 'Backend only',
  });
  expect(() => requestTicket(db, id, 'again')).toThrow('already being written');
});

test('the drafted ticket lands in the backlog, linked to the investigation', () => {
  answer();
  requestTicket(db, id, '');
  expect(claimTicketDraft(db)?.id).toBe(id);
  expect(claimTicketDraft(db)).toBeNull();
  expect(() => {
    deleteInvestigation(db, id);
  }).toThrow('being written');

  finishTicketDraft(db, id, { draft: { title: 'Fix the N+1 login query', body: 'Details.' } });
  const investigation = getInvestigation(db, id);
  expect(investigation).toMatchObject({ ticketStatus: null, ticketError: null });
  expect(getTicket(db, investigation.ticketId ?? 0)).toMatchObject({
    title: 'Fix the N+1 login query',
    body: 'Details.',
    phase: { kind: 'backlog' },
  });
  // A second ticket can be asked once the first is done.
  expect(requestTicket(db, id, 'Frontend part').ticketStatus).toBe('queued');
});

test('a failure, or a worker that stopped, keeps the error and lets it be asked again', () => {
  answer();
  requestTicket(db, id, '');
  claimTicketDraft(db);
  expect(failInterruptedTicketDrafts(db)).toEqual([id]);
  expect(getInvestigation(db, id)).toMatchObject({
    ticketStatus: 'failed',
    ticketError: 'The worker stopped while writing the ticket',
    ticketId: null,
  });
  expect(requestTicket(db, id, '').ticketStatus).toBe('queued');
});

test('a ticket is asked in Notion only when the project has a Notion data source', () => {
  answer();
  expect(() => requestTicket(db, id, '', { target: 'notion' })).toThrow(
    'not connected to a Notion',
  );
  const { projectId } = getInvestigation(db, id);
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: 'source' });
  expect(requestTicket(db, id, '', { target: 'notion' }).ticketTarget).toBe('notion');
  claimTicketDraft(db);
  const origin = { kind: 'notion' as const, id: 'page-1', url: 'https://www.notion.so/page1' };
  finishTicketDraft(db, id, { draft: { title: 'Fix it', body: '' }, origin });
  expect(getTicket(db, getInvestigation(db, id).ticketId ?? 0)).toMatchObject({
    originKind: 'notion',
    originId: 'page-1',
    originUrl: 'https://www.notion.so/page1',
  });
  expect(requestTicket(db, id, '').ticketTarget).toBeNull();
});
