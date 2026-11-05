import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  NotionError,
  saveNotionConnection,
  schema,
  type Db,
  type NotionApi,
  type NotionCommentPost,
} from '@union/core';

import { NO_HOOKS } from '../command-hooks';
import { drainCommands } from '../commands';
import { postNotionComment } from './comment-post';

let db: Db;
let projectId: number;
let ticketId: number;
let sent: unknown[] = [];
let refuse: number | null = null;

const notion = {
  addComment: (_token: string, target: unknown, richText: unknown) => {
    sent.push({ target, richText });
    if (refuse !== null) {
      return Promise.reject(new NotionError('Notion: refused', refuse));
    }
    return Promise.resolve({ id: 'c9', discussionId: 'd9', blockId: null });
  },
} as unknown as NotionApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, githubToken: 'ghp_x' })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  ticketId = createTicket(db, { projectId, title: 'Export', body: '' }).id;
  sent = [];
  refuse = null;
});

function post(discussionId: string | null): NotionCommentPost {
  return { projectId, ticketId, pageId: 'page-1', discussionId, text: 'Done in **#42**' };
}

function lastEvent(): { type: string; payload: unknown } | undefined {
  return db.select().from(schema.events).all().at(-1);
}

test('a reply goes to its discussion, as rich text, and is logged on the ticket', async () => {
  await postNotionComment(db, notion, 7, post('d1'));
  expect(sent).toEqual([
    {
      target: { discussionId: 'd1' },
      richText: [
        expect.objectContaining({ text: { content: 'Done in ', link: null } }),
        expect.objectContaining({ annotations: { bold: true, code: false } }),
      ],
    },
  ]);
  expect(lastEvent()).toMatchObject({
    type: 'notion_comment_posted',
    payload: { commandId: 7, discussionId: 'd9', commentId: 'c9' },
  });
});

test('a page comment goes to the page; a refusal names the capability and keeps the text', async () => {
  refuse = 403;
  await postNotionComment(db, notion, 8, post(null));
  expect(sent).toMatchObject([{ target: { pageId: 'page-1' } }]);
  expect(lastEvent()).toMatchObject({
    type: 'notion_comment_failed',
    payload: { commandId: 8, discussionId: null, text: 'Done in **#42**' },
  });
  expect(JSON.stringify(lastEvent()?.payload)).toContain('Insert comments');
});

test('the command hands the comment to the hook', () => {
  const posted: [number, NotionCommentPost][] = [];
  const command = db
    .insert(schema.commands)
    .values({ type: 'post_notion_comment', ticketId, payload: post('d1') })
    .returning()
    .get();
  drainCommands(db, {
    ...NO_HOOKS,
    postNotionComment: (commandId, comment) => {
      posted.push([commandId, comment]);
    },
  });
  expect(posted).toEqual([[command.id, post('d1')]]);
});
