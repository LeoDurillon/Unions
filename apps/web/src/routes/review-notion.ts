// `<review>/notion`: the Notion page a pull request under review is linked to: its text, linking and unlinking.
import { mentionTitles, notionMarkdown, schema, type Db, type NotionApi } from '@union/core';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { CONFLICT, fail, NOT_FOUND, readObject } from '../http';
import type { ReviewNotionLink, ReviewNotionPage } from '../review-notion-types';
import { guarded, requireNotionId } from './notion';
import { load, type Project, type Review } from './pr-review-load';

function tokenOf(project: Project): string {
  if (!project.notionToken) {
    throw fail(
      CONFLICT,
      'This project is not connected to Notion: set it up in the project settings',
    );
  }
  return project.notionToken;
}

function linkedPage(review: Review): string {
  if (!review.notionPageId) {
    throw fail(NOT_FOUND, 'No Notion page linked');
  }
  return review.notionPageId;
}

/** Any page the integration can read: reading it is the check that it is shared. */
async function readLink(
  notion: NotionApi,
  project: Project,
  body: Record<string, unknown>,
): Promise<ReviewNotionLink> {
  const pageId = requireNotionId(body, 'page', 'page');
  const page = await guarded(() => notion.page(tokenOf(project), pageId));
  return { pageId: page.id, title: page.title || 'Untitled Notion page', url: page.url };
}

async function pageText(db: Db, notion: NotionApi, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const pageId = linkedPage(review);
  const token = tokenOf(project);
  const page = await guarded(() => notion.page(token, pageId));
  const { markdown, truncated } = await guarded(() => notion.pageMarkdown(token, pageId));
  const titles = await mentionTitles(notion, token, markdown);
  const result: ReviewNotionPage = {
    title: page.title || 'Untitled Notion page',
    url: page.url,
    markdown: notionMarkdown(markdown, titles).trim(),
    truncated,
  };
  return c.json(result);
}

/** The review, and with `stack` the other reviews of its GitHub stack that have no page yet. */
function linkedReviews(db: Db, review: Review, stack: boolean): number[] {
  if (!stack || review.githubStackNumber === null) {
    return [review.id];
  }
  const unlinked = db
    .select({ id: schema.currentReviews.id })
    .from(schema.currentReviews)
    .where(
      and(
        eq(schema.currentReviews.projectId, review.projectId),
        eq(schema.currentReviews.githubStackNumber, review.githubStackNumber),
        ne(schema.currentReviews.id, review.id),
        isNull(schema.currentReviews.notionPageId),
      ),
    )
    .all();
  return [review.id, ...unlinked.map((row) => row.id)];
}

/** `{ page }` links this review; `{ page, stack: true }` also the stack's reviews without a page. */
async function link(db: Db, notion: NotionApi, c: Context): Promise<Response> {
  const { review, project } = load(db, c);
  const body = await readObject(c.req.raw);
  const found = await readLink(notion, project, body);
  db.update(schema.currentReviews)
    .set({ notionPageId: found.pageId, notionTitle: found.title, notionUrl: found.url })
    .where(inArray(schema.currentReviews.id, linkedReviews(db, review, body.stack === true)))
    .run();
  return c.json(found);
}

function unlink(db: Db, c: Context): Response {
  const { review } = load(db, c);
  db.update(schema.currentReviews)
    .set({ notionPageId: null, notionTitle: null, notionUrl: null })
    .where(eq(schema.currentReviews.id, review.id))
    .run();
  return c.json({ number: review.prNumber });
}

/**
 * Under `<review>`: `GET` the page's text, `POST /check` a page before linking, `PUT`, `DELETE`
 * (`/suggestions` is mounted beside, in `review-workspace.ts`).
 */
export function reviewNotionRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.get('/', (c) => pageText(db, notion, c));
  routes.post('/check', async (c) =>
    c.json(await readLink(notion, load(db, c).project, await readObject(c.req.raw))),
  );
  routes.put('/', (c) => link(db, notion, c));
  routes.delete('/', (c) => unlink(db, c));
  return routes;
}
