// The Notion routes: checking the connection and importing a page as a ticket; Notion is only read.
import {
  NotionError,
  notionMarkdown,
  parseNotionId,
  schema,
  type Db,
  type NotionApi,
} from '@union/core';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { NotionImport } from '../api-types';
import {
  BAD_GATEWAY,
  BAD_REQUEST,
  CONFLICT,
  fail,
  NOT_FOUND,
  readObject,
  requireText,
  UNAUTHORIZED,
} from '../http';
import { mentionTitles } from '../notion-mentions';

/** Notion failures become messages the UI shows next to the field. */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    if (error instanceof NotionError && error.status === UNAUTHORIZED) {
      throw fail(UNAUTHORIZED, error.message);
    }
    if (error instanceof NotionError && error.status === NOT_FOUND) {
      throw fail(NOT_FOUND, error.message);
    }
    throw fail(BAD_GATEWAY, error instanceof Error ? error.message : 'Notion request failed');
  }
}

export function requireNotionId(body: Record<string, unknown>, key: string, label: string): string {
  const id = parseNotionId(requireText(body, key));
  if (!id) {
    throw fail(BAD_REQUEST, `That is not a Notion ${label} ID or URL`);
  }
  return id;
}

async function verify(notion: NotionApi, c: Context): Promise<Response> {
  const body = await readObject(c.req.raw);
  const token = requireText(body, 'token');
  const dataSourceId = requireNotionId(body, 'dataSourceId', 'data source');
  const title = await guarded(() => notion.dataSourceTitle(token, dataSourceId));
  return c.json({ dataSourceId, title });
}

function notionOf(db: Db, projectId: number): { token: string; dataSourceId: string } {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw fail(NOT_FOUND, 'Unknown project');
  }
  const { notionToken } = project;
  const { notionDataSourceId } = project.config;
  if (!notionToken || !notionDataSourceId) {
    throw fail(
      CONFLICT,
      'This project is not connected to Notion: set it up in the project settings',
    );
  }
  return { token: notionToken, dataSourceId: notionDataSourceId };
}

/** Fetches a page of the project's data source as a ticket preview; other pages are refused. */
async function importPage(db: Db, notion: NotionApi, c: Context): Promise<Response> {
  const body = await readObject(c.req.raw);
  const { token, dataSourceId } = notionOf(db, Number(body.projectId));
  const pageId = requireNotionId(body, 'page', 'page');
  const page = await guarded(() => notion.page(token, pageId));
  if (page.dataSourceId?.replaceAll('-', '') !== dataSourceId.replaceAll('-', '')) {
    throw fail(CONFLICT, "This page is not a row of the project's Notion data source");
  }
  const { markdown, truncated } = await guarded(() => notion.pageMarkdown(token, pageId));
  const titles = await mentionTitles(notion, token, markdown);
  const result: NotionImport = {
    title: page.title || 'Untitled Notion page',
    body: `${notionMarkdown(markdown, titles).trim()}\n\n---\nImported from Notion: ${page.url}`,
    url: page.url,
    truncated,
    pageId: page.id,
  };
  return c.json(result);
}

export function notionRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.post('/verify', (c) => verify(notion, c));
  routes.post('/import', (c) => importPage(db, notion, c));
  return routes;
}
