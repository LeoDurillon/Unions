// `GET <review>/trackers/:kind`: the review's linked items of the tracker, with their text, comments and properties.
// Also `GET …/:itemId/moves`: the moves a linked item offers now, for its status.

import {
  linkedTrackerItems,
  type Db,
  type IntegrationApis,
  type TrackerAccess,
  type TrackerItemText,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { NOT_FOUND, fail } from '../../http';
import type { ReviewTrackerItem } from '../../review-tracker-types';
import { pendingReviewFields } from '../../tracker-field-commands';
import { load } from '../pull-requests/pr-review-load';
import { guarded } from '../tracker-errors';
import {
  requireAccess,
  requireLinked,
  reviewTracker,
  type ReviewTracker,
} from './review-tracker-access';

function errorOf(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : String(error) };
}

/** One item: its text (a refusal fails the read), then its properties and comments (each may be missing). */
async function itemText(
  db: Db,
  {
    tracker,
    access,
    reviewId,
  }: { tracker: ReviewTracker; access: TrackerAccess; reviewId: number },
  linked: { id: string; url: string | null },
): Promise<ReviewTrackerItem> {
  const { adapter } = tracker;
  const { secret, config } = access;
  const reader = adapter.text;
  const text: TrackerItemText = reader
    ? await guarded(() => reader.read(secret, config, linked.id))
    : { markdown: '', truncated: false };
  const facts = await adapter.fields?.read(access, linked.id).catch(() => null);
  const threads = adapter.comments
    ? await adapter.comments.read(secret, config, linked.id).catch(errorOf)
    : { error: 'This tracker has no comments' };
  return {
    itemId: linked.id,
    // A Jira issue gives its summary with its text, should its fields not be read.
    title: facts ? facts.title : (text.title ?? ''),
    url: linked.url ?? adapter.refs?.url(linked.id, config) ?? '',
    markdown: text.markdown,
    truncated: text.truncated,
    threads,
    properties: facts?.properties ?? [],
    pendingFields: pendingReviewFields(db, reviewId, linked.id),
  };
}

/** Every linked item, in the specs' order. */
async function itemsText(db: Db, apis: IntegrationApis, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const tracker = reviewTracker(db, apis, c, project.id);
  const linked = linkedTrackerItems(db, { kind: 'review', id: review.id }, tracker.kind);
  if (linked.length === 0) {
    return c.json([]);
  }
  const access = requireAccess(tracker);
  const read: ReviewTrackerItem[] = [];
  for (const item of linked) {
    // One item at a time: each reads several things, and the trackers answer 429 to bursts.
    read.push(await itemText(db, { tracker, access, reviewId: review.id }, item));
  }
  return c.json(read);
}

async function moves(db: Db, apis: IntegrationApis, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const tracker = reviewTracker(db, apis, c, project.id);
  const itemId = requireLinked(db, review.id, tracker.kind, c.req.param('itemId') ?? '');
  const access = requireAccess(tracker);
  const { fields } = tracker.adapter;
  if (!fields?.moves) {
    throw fail(NOT_FOUND, 'This tracker has no moves');
  }
  return c.json(await guarded(() => fields.moves?.(access, itemId) ?? Promise.resolve([])));
}

export function reviewTrackerItemRoutes(db: Db, apis: IntegrationApis): Hono {
  const routes = new Hono();
  routes.get('/trackers/:kind', (c) => itemsText(db, apis, c));
  routes.get('/trackers/:kind/:itemId/moves', (c) => moves(db, apis, c));
  return routes;
}
