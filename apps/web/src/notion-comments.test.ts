import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
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
import type { NotionDiscussionsView } from './notion-discussion-types';

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

const notion = {
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
  const view = (await response.json()) as NotionDiscussionsView;
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

test('a page with many commented blocks is read in part, and says so', async () => {
  markdown = Array.from({ length: 31 }, (_, index) => {
    const id = String(index).padStart(8, '0');
    return span(`${id}-bbbb-4ccc-8ddd-eeeeeeeeeeee`, `${id}-dddd-4ccc-8ddd-eeeeeeeeeeee`, 'x');
  }).join('\n');
  const view = (await (await read()).json()) as NotionDiscussionsView;
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
