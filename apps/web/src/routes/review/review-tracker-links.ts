// `<review>/trackers/:kind` links: check an item, link it, unlink it, and the items the pull request names.
// `POST /check` reads it first, `PUT` links it (to the stack's reviews without one too), `DELETE /:itemId`.

import {
  integrationKind,
  linkedTrackerItems,
  linkTrackerItem,
  schema,
  unlinkTrackerItem,
  type Db,
  type IntegrationApis,
  type IntegrationKindName,
  type LinkedItem,
} from '@union/core';
import { and, eq, ne } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { OnboardingGitHub } from '../../github-onboarding';
import { BAD_REQUEST, fail, readObject, requireText } from '../../http';
import { guarded } from '../notion';
import { authOf, load, type Review } from '../pull-requests/pr-review-load';
import { requireAccess, reviewTracker, type ReviewTracker } from './review-tracker-access';

/** A description rarely names more; each is a read of the tracker. */
const MAX_SUGGESTIONS = 10;

/** Any item the account can read: a pull request may implement another project's. */
async function readItem(tracker: ReviewTracker, ref: string): Promise<LinkedItem> {
  const { kind, adapter } = tracker;
  const access = requireAccess(tracker);
  const { label, itemLabel } = integrationKind(kind);
  const itemId = adapter.refs?.parse(ref) ?? null;
  if (!adapter.refs || !itemId) {
    throw fail(BAD_REQUEST, `That is not a ${label} ${itemLabel} link or ID`);
  }
  const elsewhere = adapter.refs.error(ref, access.config);
  if (elsewhere !== null) {
    throw fail(BAD_REQUEST, elsewhere);
  }
  const { refs } = adapter;
  const found = await guarded(() => refs.check(access.secret, access.config, itemId, true));
  return found;
}

/** The review, and with `stack` the other reviews of its GitHub stack that have no item of the tracker yet. */
function linkedReviews(
  db: Db,
  review: Review,
  { stack, kind }: { stack: boolean; kind: IntegrationKindName },
): number[] {
  if (!stack || review.githubStackNumber === null) {
    return [review.id];
  }
  const others = db
    .select({ id: schema.currentReviews.id })
    .from(schema.currentReviews)
    .where(
      and(
        eq(schema.currentReviews.projectId, review.projectId),
        eq(schema.currentReviews.githubStackNumber, review.githubStackNumber),
        ne(schema.currentReviews.id, review.id),
      ),
    )
    .all()
    .filter((other) => linkedTrackerItems(db, { kind: 'review', id: other.id }, kind).length === 0);
  return [review.id, ...others.map((other) => other.id)];
}

/** `{ item }` links one more item; `{ item, stack: true }` also to the stack's reviews without one. */
async function link(db: Db, apis: IntegrationApis, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const tracker = reviewTracker(db, apis, c, project.id);
  const body = await readObject(c.req.raw);
  const found = await readItem(tracker, requireText(body, 'item'));
  const { namedByKey } = integrationKind(tracker.kind);
  const title = namedByKey ? `${found.itemId} ${found.title}` : found.title;
  const item = { id: found.itemId, title, url: found.url };
  for (const id of linkedReviews(db, review, { stack: body.stack === true, kind: tracker.kind })) {
    linkTrackerItem(db, { kind: 'review', id }, tracker.kind, item);
  }
  return c.json(found);
}

/** The items the pull request names (title, branch, description), readable and not linked yet. */
async function suggestions(
  db: Db,
  clients: { apis: IntegrationApis; github: OnboardingGitHub },
  c: Context,
): Promise<Response> {
  const { review, project } = load(db, c);
  const tracker = reviewTracker(db, clients.apis, c, project.id);
  const { refs } = tracker.adapter;
  if (!tracker.access || !refs) {
    return c.json([]);
  }
  const linked = new Set(
    linkedTrackerItems(db, { kind: 'review', id: review.id }, tracker.kind).map((item) => item.id),
  );
  // The title and branch are known; the description is read, and left out if GitHub does not answer.
  const discussion = await clients.github
    .getDiscussion(authOf(db, project), project, review.prNumber)
    .catch(() => null);
  const texts = [review.title, review.headBranch, discussion?.description ?? ''];
  const ids = refs
    .namedIn(texts, tracker.access.config)
    .filter((id) => !linked.has(id))
    .slice(0, MAX_SUGGESTIONS);
  const found = await Promise.all(
    ids.map((id) =>
      readItem(tracker, id).then(
        (item): LinkedItem[] => [item],
        (): LinkedItem[] => [],
      ),
    ),
  );
  return c.json(found.flat());
}

export function reviewTrackerLinkRoutes(
  db: Db,
  clients: { apis: IntegrationApis; github: OnboardingGitHub },
): Hono {
  const { apis } = clients;
  const routes = new Hono();
  routes.get('/trackers/:kind/suggestions', (c) => suggestions(db, clients, c));
  routes.post('/trackers/:kind/check', async (c) => {
    const { project } = load(db, c);
    const ref = requireText(await readObject(c.req.raw), 'item');
    return c.json(await readItem(reviewTracker(db, apis, c, project.id), ref));
  });
  routes.put('/trackers/:kind', (c) => link(db, apis, c));
  routes.delete('/trackers/:kind/:itemId', (c) => {
    const { review, project } = load(db, c);
    const { kind } = reviewTracker(db, apis, c, project.id);
    unlinkTrackerItem(db, { kind: 'review', id: review.id }, kind, c.req.param('itemId'));
    return c.json({ number: review.prNumber });
  });
  return routes;
}
