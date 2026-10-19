import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from './db';
import type { NotionPropertyAction } from './event-actions';
import {
  backfillNotionPages,
  finishDelivery,
  nextDelivery,
  queueDeliveries,
  recentDeliveries,
} from './event-deliveries';
import { EventRuleError, notionSets } from './event-notion-action';
import { isTrigger, notionPropertyValue, renderTemplate } from './event-rule-types';
import {
  type EventRule,
  saveRule,
  storeNotionSchema,
  templateValues,
  triggerMatches,
} from './event-rules';
import * as schema from './tables';
import { createTicket, emitEvent, getTicket } from './tickets';

let db: Db;
let projectId: number;

const PROPERTIES = [
  { id: 'p%3Ar', name: 'PR', type: 'url', options: [] },
  { id: 'n%3Ab', name: 'PR number', type: 'number', options: [] },
  { id: 's%3At', name: 'Status', type: 'status', options: ['Todo', 'In review', 'Done'] },
  { id: 'f%3Ao', name: 'Formula', type: 'formula', options: [] },
  { id: 'd%3Ev', name: 'Dev', type: 'people', options: [] },
];

const ADA = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  storeNotionSchema(db, projectId, 'ds', { title: 'Roadmap', properties: PROPERTIES });
});

function prRule(
  value = '{pr.url}',
  propertyId = 'p%3Ar',
): EventRule & { action: NotionPropertyAction } {
  const rule = saveRule(db, projectId, {
    name: 'PR link',
    enabled: true,
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'notion_property', values: [{ propertyId, value }] },
  });
  if (rule.action.kind !== 'notion_property') {
    throw new Error('A Notion rule was saved as another kind');
  }
  return { ...rule, action: rule.action };
}

test('a rule is checked against the stored Notion schema before it is saved', () => {
  expect(prRule().action).toEqual({
    kind: 'notion_property',
    values: [{ propertyId: 'p%3Ar', value: '{pr.url}' }],
  });
  expect(() => prRule('{pr.link}')).toThrow('Unknown variable: {pr.link}');
  expect(() => prRule('x', 'gone')).toThrow('Pick a property');
  expect(() => prRule('x', 'f%3Ao')).toThrow('cannot be set by a rule');
  expect(() => prRule('Shipped', 's%3At')).toThrow('not a status of this property');
  expect(() => prRule('soon', 'n%3Ab')).toThrow(EventRuleError);
  expect(prRule(ADA, 'd%3Ev').action.values[0]?.value).toBe(ADA);
  expect(() => prRule('{pr.url}', 'd%3Ev')).toThrow('not variables');
  expect(() => prRule('Ada', 'd%3Ev')).toThrow('is not a Notion user');
  expect(
    saveRule(db, projectId, {
      name: 'Done',
      enabled: true,
      trigger: { kind: 'board_status', status: 'done' },
      action: { kind: 'notion_property', values: [{ propertyId: 's%3At', value: 'Done' }] },
    }).trigger,
  ).toEqual({ kind: 'board_status', status: 'done' });
});

test('values take the shape of the property type', () => {
  expect(notionPropertyValue({ type: 'number', options: [] }, '42')).toEqual({
    value: { number: 42 },
  });
  expect(notionPropertyValue({ type: 'rich_text', options: [] }, '#42')).toEqual({
    value: { rich_text: [{ type: 'text', text: { content: '#42' } }] },
  });
  expect(notionPropertyValue({ type: 'checkbox', options: [] }, 'yes')).toEqual({
    value: { checkbox: true },
  });
  expect(notionPropertyValue({ type: 'url', options: [] }, '')).toEqual({ value: { url: null } });
  expect(notionPropertyValue({ type: 'people', options: [] }, `${ADA}, ${ADA}`)).toEqual({
    value: {
      people: [
        { object: 'user', id: ADA },
        { object: 'user', id: ADA },
      ],
    },
  });
  expect(notionPropertyValue({ type: 'people', options: [] }, '')).toEqual({
    value: { people: [] },
  });
  expect(renderTemplate('PR {pr.number} ({missing})', { 'pr.number': '7' })).toBe('PR 7 ()');
});

function moved(from: string, to: string, board: string): { type: string; payload: unknown } {
  return {
    type: 'phase_changed',
    payload: {
      from: { kind: from, step: 'implement' },
      to: { kind: to, step: 'final_review' },
      board,
    },
  };
}

test('triggers match the events Union logs', () => {
  expect(
    triggerMatches({ kind: 'pull_request_linked' }, { type: 'pull_request_opened', payload: {} }),
  ).toBe(true);
  expect(
    triggerMatches(
      { kind: 'board_status', status: 'in_review' },
      moved('running', 'running', 'in_review'),
    ),
  ).toBe(true);
  // Staying in a column is not moving to it.
  expect(
    triggerMatches(
      { kind: 'board_status', status: 'in_progress' },
      {
        type: 'phase_changed',
        payload: {
          from: { kind: 'running', step: 'intake' },
          to: { kind: 'awaiting_approval', step: 'intake' },
          board: 'in_progress',
        },
      },
    ),
  ).toBe(false);
  expect(
    triggerMatches(
      { kind: 'awaiting_approval', step: 'final_review' },
      moved('running', 'awaiting_approval', 'in_review'),
    ),
  ).toBe(true);
  expect(
    triggerMatches(
      { kind: 'awaiting_approval', step: 'intake' },
      moved('running', 'awaiting_approval', 'in_review'),
    ),
  ).toBe(false);
  const red = { type: 'pull_request_checks_failed', payload: { number: 7, sha: 'abc' } };
  expect(triggerMatches({ kind: 'pull_request_checks_failed' }, red)).toBe(true);
  expect(
    triggerMatches({ kind: 'pull_request_checks_failed' }, { ...red, type: 'pull_request_status' }),
  ).toBe(false);
});

test('events after a rule is made queue one delivery each; earlier ones never do', () => {
  const ticket = createTicket(db, { projectId, title: 'Search', notionPageId: 'page-1' });
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 1, url: '' },
  });
  // The first read starts at the end of the log.
  expect(queueDeliveries(db)).toBe(0);
  const rule = prRule();
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticket.id)).run();
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 7, url: '' },
  });
  emitEvent(db, { type: 'branch_pushed', ticketId: ticket.id, payload: { branch: 'b' } });
  expect(queueDeliveries(db)).toBe(1);
  expect(queueDeliveries(db)).toBe(0);

  const due = nextDelivery(db);
  expect(due?.rule.id).toBe(rule.id);
  const sets = due
    ? notionSets(
        PROPERTIES,
        rule.action,
        templateValues({ owner: 'acme', repo: 'shop' }, getTicket(db, ticket.id), due.event),
      )
    : null;
  expect(sets).toEqual({
    sets: [
      {
        property: { id: 'p%3Ar', name: 'PR', type: 'url', options: [] },
        text: 'https://github.com/acme/shop/pull/7',
        value: { url: 'https://github.com/acme/shop/pull/7' },
      },
    ],
  });
});

test('temporary failures are tried again later, then given up', () => {
  const ticket = createTicket(db, { projectId, title: 't' });
  queueDeliveries(db);
  prRule();
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 1, url: '' },
  });
  queueDeliveries(db);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const due = nextDelivery(db, Number.MAX_SAFE_INTEGER);
    if (!due) {
      throw new Error(`nothing due at attempt ${attempt}`);
    }
    finishDelivery(db, due.delivery, { status: 'retry', error: 'Notion: rate limited' });
  }
  expect(nextDelivery(db, Number.MAX_SAFE_INTEGER)).toBeNull();
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'failed', attempts: 5, error: 'Notion: rate limited' },
  ]);
});

test('tickets imported before the link was stored are linked from their description', () => {
  const imported = createTicket(db, {
    projectId,
    title: 'Old import',
    body: 'Text.\n\n---\nImported from Notion: https://www.notion.so/acme/Add-search-0123456789abcdef0123456789abcdef',
  });
  createTicket(db, { projectId, title: 'Local', body: 'Nothing here.' });
  expect(backfillNotionPages(db)).toBe(1);
  expect(getTicket(db, imported.id).notionPageId).toBe('01234567-89ab-cdef-0123-456789abcdef');
  expect(backfillNotionPages(db)).toBe(0);
});

test('a review posted on a pull request without a ticket queues the rules of its project', () => {
  queueDeliveries(db);
  saveRule(db, projectId, {
    name: 'Approved',
    enabled: true,
    trigger: { kind: 'pull_request_reviewed', verdict: 'approve' },
    action: { kind: 'notion_property', propertyId: 's%3At', value: 'Done' },
  });
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 9,
      title: 't',
      url: 'u',
      author: 'a',
      headBranch: 'h',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  const posted = { reviewId, number: 9, url: 'https://github.com/acme/shop/pull/9#r1' };
  emitEvent(db, { type: 'pr_review_posted', payload: { ...posted, verdict: 'request_changes' } });
  emitEvent(db, { type: 'pr_review_posted', payload: { ...posted, verdict: 'approve' } });
  expect(queueDeliveries(db)).toBe(1);

  const due = nextDelivery(db);
  expect(
    due ? templateValues({ owner: 'acme', repo: 'shop' }, null, due.event) : null,
  ).toMatchObject({
    'pr.number': '9',
    'pr.url': 'https://github.com/acme/shop/pull/9',
    'review.verdict': 'Approved',
    'review.url': posted.url,
  });
});

function reviewPosted(verdict?: 'approve' | 'request_changes'): { type: string; payload: unknown } {
  return {
    type: 'pr_review_posted',
    payload: { reviewId: 1, number: 9, url: 'u', ...(verdict ? { verdict } : {}) },
  };
}

test('a review trigger matches its verdict, or any verdict', () => {
  const changes = { kind: 'pull_request_reviewed', verdict: 'request_changes' } as const;
  expect(triggerMatches(changes, reviewPosted('request_changes'))).toBe(true);
  expect(triggerMatches(changes, reviewPosted('approve'))).toBe(false);
  // Reviews posted before the verdict was logged match only "any verdict".
  expect(triggerMatches(changes, reviewPosted())).toBe(false);
  expect(triggerMatches({ kind: 'pull_request_reviewed', verdict: null }, reviewPosted())).toBe(
    true,
  );
  expect(isTrigger({ kind: 'pull_request_reviewed', verdict: 'merge' })).toBe(false);
});
