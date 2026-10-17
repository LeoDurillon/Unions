import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from './db';
import * as schema from './schema';
import { chooseFlow, FlowChangeRefused } from './ticket-flow';
import { createTicket, dispatch, getTicket } from './tickets';

let db: Db;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
});

test('a backlog ticket takes a flow, and starts on its first step', () => {
  chooseFlow(db, ticketId, ['implement', 'final_review']);
  expect(dispatch(db, ticketId, { type: 'start' })).toEqual({ kind: 'running', step: 'implement' });
});

test('a started ticket keeps its flow, and steps that are no flow are refused', () => {
  expect(() => chooseFlow(db, ticketId, ['technical', 'implement'])).toThrow(FlowChangeRefused);
  dispatch(db, ticketId, { type: 'start' });
  expect(() => chooseFlow(db, ticketId, null)).toThrow(
    'The flow can only change before the ticket starts',
  );
  expect(getTicket(db, ticketId).flow).toHaveLength(6);
});
