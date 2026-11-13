import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  migrateDb,
  NotionError,
  saveNotionConnection,
  schema,
  setTicketOrigin,
  type Db,
  type NotionApi,
  type NotionComment,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import type { NotionTabView } from './notion-discussion-types';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAGE_URL = 'https://www.notion.so/Export-aaaaaaaabbbb4ccc8dddeeeeeeeeeeee';
const BLOCK = 'b1b1b1b1-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ON_TEXT = 'd1d1d1d1-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function span(block: string, discussion: string, text: string): string {
  return `<span discussion-urls="discussion://${PAGE}/${block}/${discussion}">${text}</span>`;
}

function comment(id: string, discussionId: string, blockId: string | null): NotionComment {
  return {
    id,
    discussionId,
    blockId,
    author: id === 'c3' ? '' : 'Grace',
    createdAt: `2026-01-0${id.slice(1)}T00:00:00.000Z`,
    richText: [
      { text: 'Is it ', href: null, bold: false, italic: false, strikethrough: false, code: false },
      { text: 'CSV', href: null, bold: false, italic: false, strikethrough: false, code: true },
    ],
  };
}

let markdown = '';
let reads: string[] = [];
let refuse = false;

const PAGE_OBJECT = {
  id: PAGE,
  title: 'Export CSV',
  url: PAGE_URL,
  dataSourceId: null,
  editedAt: '2026-11-12T10:00:00.000Z',
  status: { name: 'Avancement', value: 'En cours' },
  properties: [{ id: 'st', name: 'Avancement', type: 'status', text: 'En cours', settable: true }],
};
let pageRead: () => Promise<unknown> = () => Promise.resolve(PAGE_OBJECT);

const notion = {
  page: () => pageRead(),
  pageMarkdown: () => Promise.resolve({ markdown, truncated: false }),
  comments: (_token: string, id: string) => {
    reads.push(id);
    if (refuse) {
      return Promise.reject(new NotionError('Insufficient permissions', 403));
    }
    if (id === PAGE) {
      return Promise.resolve([comment('c1', 'on-page', null), comment('c3', ON_TEXT, BLOCK)]);
    }
    return Promise.resolve(id === BLOCK ? [comment('c2', ON_TEXT, BLOCK)] : []);
  },
} as unknown as NotionApi;

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  pageRead = () => Promise.resolve(PAGE_OBJECT);
  markdown = `# Spec\n\nThe ${span(BLOCK, ON_TEXT, 'export format')} is open.`;
  reads = [];
  refuse = false;
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, notion);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, githubToken: 'ghp_x' })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  ticketId = createTicket(db, { projectId, title: 'Export', body: 'As written' }).id;
  setTicketOrigin(db, ticketId, { kind: 'notion', id: PAGE, url: PAGE_URL });
});

function read(): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/notion-comments`);
}

test('the discussions: the page one, then the one on the text with its quote', async () => {
  const response = await read();
  expect(response.status).toBe(200);
  const view = (await response.json()) as NotionTabView;
  expect(reads).toEqual([PAGE, BLOCK]);
  expect(view.truncated).toBe(false);
  expect(view.discussions.map(({ id, place, quote }) => ({ id, place, quote }))).toEqual([
    { id: 'on-page', place: 'page', quote: null },
    { id: ON_TEXT, place: 'text', quote: 'export format' },
  ]);
  const [, onText] = view.discussions;
  expect(onText?.url).toBe(`${PAGE_URL}?d=${ON_TEXT.replaceAll('-', '')}`);
  expect(onText?.comments.map((item) => [item.id, item.author, item.markdown])).toEqual([
    ['c2', 'Grace', 'Is it `CSV`'],
    ['c3', 'Notion user', 'Is it `CSV`'],
  ]);
});

test('the page comes with its title, status, last edit and properties; a failed read leaves them out', async () => {
  const view = (await (await read()).json()) as NotionTabView;
  expect(view.page).toEqual({
    title: 'Export CSV',
    status: { name: 'Avancement', value: 'En cours' },
    editedAt: '2026-11-12T10:00:00.000Z',
    properties: PAGE_OBJECT.properties,
  });
  pageRead = () => Promise.reject(new NotionError('Not found', 404));
  const without = (await (await read()).json()) as NotionTabView;
  expect(without.page).toBeNull();
  expect(without.discussions).toHaveLength(2);
});

test('a page with many commented blocks is read in part, and says so', async () => {
  markdown = Array.from({ length: 31 }, (_, index) => {
    const id = String(index).padStart(8, '0');
    return span(`${id}-bbbb-4ccc-8ddd-eeeeeeeeeeee`, `${id}-dddd-4ccc-8ddd-eeeeeeeeeeee`, 'x');
  }).join('\n');
  const view = (await (await read()).json()) as NotionTabView;
  expect(reads.length).toBe(31);
  expect(view.truncated).toBe(true);
});

test('without the Read comments capability, the answer says which one to turn on', async () => {
  refuse = true;
  const response = await read();
  expect(response.status).toBe(409);
  expect(JSON.stringify(await response.json())).toContain('Read comments');
});

test('a ticket without a Notion page is refused', async () => {
  setTicketOrigin(db, ticketId, null);
  const response = await read();
  expect(response.status).toBe(409);
  expect(reads).toEqual([]);
});

function send(body: unknown): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/notion-comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a reply is queued for the worker and shows pending until its event', async () => {
  const response = await send({ discussionId: ON_TEXT, text: ' Done in #42 ' });
  expect(response.status).toBe(202);
  const { id } = (await response.json()) as { id: number };
  const command = db.select().from(schema.commands).all().at(-1);
  expect(command).toMatchObject({
    id,
    type: 'post_notion_comment',
    ticketId,
    payload: { pageId: PAGE, discussionId: ON_TEXT, text: 'Done in #42' },
  });
  let view = (await (await read()).json()) as NotionTabView;
  expect(view.pending.map((item) => [item.discussionId, item.text])).toEqual([
    [ON_TEXT, 'Done in #42'],
  ]);
  emitEvent(db, {
    type: 'notion_comment_posted',
    ticketId,
    payload: { commandId: id, discussionId: ON_TEXT, commentId: 'c9' },
  });
  view = (await (await read()).json()) as NotionTabView;
  expect(view.pending).toEqual([]);
});

test('an empty comment is refused, and nothing is queued', async () => {
  const response = await send({ text: '  ' });
  expect(response.status).toBe(400);
  expect(db.select().from(schema.commands).all()).toEqual([]);
});

function addToReview(discussionId: string, commentId?: string): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/notion-comments/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ discussionId, commentId }),
  });
}

test('Add to review waits for a branch', async () => {
  let view = (await (await read()).json()) as NotionTabView;
  expect(view.review).toEqual({
    importedIds: [],
    refusal: 'Available once the ticket is implemented',
  });
  expect((await addToReview(ON_TEXT)).status).toBe(409);
  db.update(schema.tickets).set({ branch: '1-export' }).run();
  view = (await (await read()).json()) as NotionTabView;
  expect(view.review.refusal).toBeNull();
});

test('a discussion goes into the review once, whole, with its Notion link', async () => {
  db.update(schema.tickets).set({ branch: '1-export' }).run();
  expect(await (await addToReview(ON_TEXT)).json()).toEqual({ imported: true });
  expect(await (await addToReview(ON_TEXT)).json()).toEqual({ imported: false });
  const rows = db.select().from(schema.reviewComments).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: 'general',
    status: 'draft',
    sourceUrl: `https://www.notion.so/${PAGE.replaceAll('-', '')}?d=${ON_TEXT.replaceAll('-', '')}`,
    body: '**Grace** on the Notion page, about "export format":\n\nIs it `CSV`\n\n**Notion user** replied:\n\nIs it `CSV`',
  });
  const view = (await (await read()).json()) as NotionTabView;
  expect(view.review.importedIds).toEqual([ON_TEXT]);
  expect((await addToReview('gone')).status).toBe(404);
});

test('one comment of a discussion goes into the review alone, with its own link', async () => {
  db.update(schema.tickets).set({ branch: '1-export' }).run();
  expect(await (await addToReview('on-page', 'c1')).json()).toEqual({ imported: true });
  expect(await (await addToReview('on-page', 'c1')).json()).toEqual({ imported: false });
  expect((await addToReview('on-page', 'gone')).status).toBe(404);
  const rows = db.select().from(schema.reviewComments).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    sourceUrl: `https://www.notion.so/${PAGE.replaceAll('-', '')}?d=onpage&c=c1`,
    body: '**Grace** on the Notion page:\n\nIs it `CSV`',
  });
  const view = (await (await read()).json()) as NotionTabView;
  expect(view.review.importedIds).toEqual(['c1']);
});
