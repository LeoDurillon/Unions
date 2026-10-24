// `<review>/notion`: the Notion pages a pull request under review is linked to (its `notion` specs):
// their text, linking one more, unlinking one.
import {
  linkedNotionPages,
  linkNotionPage,
  mentionTitles,
  notionMarkdown,
  schema,
  unlinkNotionPage,
  type Db,
  type NotionApi,
} from '@union/core';
import { and, eq, ne } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { readObject } from '../http';
import type { ReviewNotionLink, ReviewNotionPage } from '../review-notion-types';
import { guarded, notionTokenOf, requireNotionId } from './notion';
import { load, type Review } from './pr-review-load';

/** Any page the integration can read: reading it is the check that it is shared. */
async function readLink(
  notion: NotionApi,
  token: string,
  body: Record<string, unknown>,
): Promise<ReviewNotionLink> {
  const pageId = requireNotionId(body, 'page', 'page');
  const page = await guarded(() => notion.page(token, pageId));
  return { pageId: page.id, title: page.title || 'Untitled Notion page', url: page.url };
}

async function pageText(
  notion: NotionApi,
  token: string,
  pageId: string,
): Promise<ReviewNotionPage> {
  const page = await guarded(() => notion.page(token, pageId));
  const { markdown, truncated } = await guarded(() => notion.pageMarkdown(token, pageId));
  const titles = await mentionTitles(notion, token, markdown);
  return {
    pageId,
    title: page.title || 'Untitled Notion page',
    url: page.url,
    markdown: notionMarkdown(markdown, titles).trim(),
    truncated,
  };
}

/** Every linked page with its text, in the specs' order. */
async function pagesText(db: Db, notion: NotionApi, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const pages = linkedNotionPages(db, { kind: 'review', id: review.id });
  if (pages.length === 0) {
    return c.json([]);
  }
  const token = notionTokenOf(db, project.id);
  return c.json(await Promise.all(pages.map((page) => pageText(notion, token, page.id))));
}

/** The review, and with `stack` the other reviews of its GitHub stack that have no page yet. */
function linkedReviews(db: Db, review: Review, stack: boolean): number[] {
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
    .filter((other) => linkedNotionPages(db, { kind: 'review', id: other.id }).length === 0);
  return [review.id, ...others.map((other) => other.id)];
}

/** `{ page }` links one more page; `{ page, stack: true }` also to the stack's reviews without a page. */
async function link(db: Db, notion: NotionApi, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const body = await readObject(c.req.raw);
  const found = await readLink(notion, notionTokenOf(db, project.id), body);
  const page = { id: found.pageId, title: found.title, url: found.url };
  for (const id of linkedReviews(db, review, body.stack === true)) {
    linkNotionPage(db, { kind: 'review', id }, page);
  }
  return c.json(found);
}

function unlink(db: Db, c: Context): Response {
  const { review } = load(db, c);
  unlinkNotionPage(db, { kind: 'review', id: review.id }, c.req.param('pageId') ?? '');
  return c.json({ number: review.prNumber });
}

/**
 * Under `<review>`: `GET` the linked pages' text, `POST /check` a page before linking, `PUT` links one
 * more, `DELETE /:pageId` unlinks one (`/suggestions` is mounted beside, in `review-workspace.ts`).
 */
export function reviewNotionRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.get('/', (c) => pagesText(db, notion, c));
  routes.post('/check', async (c) =>
    c.json(
      await readLink(
        notion,
        notionTokenOf(db, load(db, c).project.id),
        await readObject(c.req.raw),
      ),
    ),
  );
  routes.put('/', (c) => link(db, notion, c));
  routes.delete('/:pageId', (c) => unlink(db, c));
  return routes;
}
