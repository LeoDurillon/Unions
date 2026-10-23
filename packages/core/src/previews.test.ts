import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from './db';
import {
  activePreviews,
  getPreview,
  isTicketPreview,
  previewHost,
  previewOwner,
  previewProject,
  recordE2e,
  recoverPreviews,
  setComposeOverride,
  updatePreview,
} from './previews';
import * as schema from './tables';
import { createTicket } from './tickets';

let db: Db;
let projectId: number;
let ticketId: number;
let reviewId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'T' }).id;
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 1582,
      title: 'PR',
      url: 'u',
      author: 'alice',
      headBranch: 'b',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
});

function previewEvents(): unknown[] {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, 'preview_changed'))
    .all()
    .map((row) => row.ticketId);
}

test("names and hosts tell a ticket's preview from a pull request's", () => {
  expect(previewProject({ ticketId: 12 })).toBe('union-t12');
  expect(previewProject({ reviewId: 3 })).toBe('union-r3');
  expect(previewHost({ ticketId: 12 })).toBe('t12.union.localhost');
  expect(previewHost({ reviewId: 3 })).toBe('r3.union.localhost');
});

test("a ticket's and a review's previews are separate rows, each in its project", () => {
  updatePreview(db, { ticketId }, { status: 'running', url: 'http://t1.union.localhost' });
  updatePreview(db, { reviewId }, { status: 'starting' });
  updatePreview(db, { reviewId }, { status: 'running', url: 'http://r1.union.localhost' });

  expect(getPreview(db, { ticketId })).toMatchObject({
    reviewId: null,
    projectId,
    status: 'running',
  });
  const review = getPreview(db, { reviewId });
  expect(review).toMatchObject({ ticketId: null, projectId, url: 'http://r1.union.localhost' });
  expect(review ? previewOwner(review) : null).toEqual({ reviewId });
  expect(activePreviews(db).filter((row) => isTicketPreview(row))).toHaveLength(1);
  expect(activePreviews(db)).toHaveLength(2);
  // Only the ticket's changes are events: a review's page polls.
  expect(previewEvents()).toEqual([ticketId]);
});

test("a review's compose override and e2e result stay on its own row", () => {
  updatePreview(db, { ticketId }, { status: 'stopped' });
  setComposeOverride(db, { reviewId }, 'services: {}');
  recordE2e(db, { reviewId }, { e2eStatus: 'green' });
  expect(getPreview(db, { reviewId })).toMatchObject({
    status: 'stopped',
    override: 'services: {}',
    e2eStatus: 'green',
  });
  expect(getPreview(db, { ticketId })).toMatchObject({ override: null, e2eStatus: null });
});

test('a stopped worker leaves both kinds of preview to start or stop again', () => {
  updatePreview(db, { ticketId }, { status: 'starting' });
  updatePreview(db, { reviewId }, { status: 'stopping' });
  recordE2e(db, { reviewId }, { e2eStatus: 'running' });
  recoverPreviews(db);
  expect(getPreview(db, { ticketId })?.status).toBe('failed');
  expect(getPreview(db, { reviewId })).toMatchObject({ status: 'failed', e2eStatus: 'skipped' });
});

test('a preview has exactly one owner, and goes with it', () => {
  const insert = (values: { ticketId?: number; reviewId?: number }): void => {
    db.insert(schema.previews)
      .values({ ...values, projectId, status: 'stopped' })
      .run();
  };
  expect(() => {
    insert({ ticketId, reviewId });
  }).toThrow();
  expect(() => {
    insert({});
  }).toThrow();
  updatePreview(db, { reviewId }, { status: 'stopped' });
  db.delete(schema.currentReviews).where(eq(schema.currentReviews.id, reviewId)).run();
  expect(getPreview(db, { reviewId })).toBeNull();
});
