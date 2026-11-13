import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  JiraError,
  migrateDb,
  NotionError,
  saveIntegration,
  schema,
  type AdfRichDocument,
  type Db,
  type JiraApi,
  type NotionApi,
  type TrackerCommentPost,
} from '@union/core';

import { NO_HOOKS } from './command-hooks';
import { drainCommands } from './commands';
import { postTrackerComment } from './tracker-comment-post';

const FORBIDDEN = 403;

let db: Db;
let projectId: number;
let ticketId: number;
let sent: { target: unknown; body: unknown }[];
let failure: Error | null;

function answer<T>(target: unknown, body: unknown, value: T): Promise<T> {
  if (failure) {
    return Promise.reject(failure);
  }
  sent.push({ target, body });
  return Promise.resolve(value);
}

const apis = {
  jira: {
    addComment: (_auth, key, body) => answer(key, body, { id: '10200' }),
  } satisfies Partial<JiraApi> as unknown as JiraApi,
  notion: {
    addComment: (_token, target, richText) =>
      answer(target, richText, {
        id: 'c9',
        discussionId: 'd9',
        blockId: null,
        author: 'Union',
        createdAt: '2026-01-01T00:00:00.000Z',
        richText: [],
      }),
  } satisfies Partial<NotionApi> as unknown as NotionApi,
};

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  saveIntegration(db, projectId, 'notion', { secret: 'secret', config: { dataSourceId: 'ds' } });
  ticketId = createTicket(db, { projectId, title: 'Dark mode' }).id;
  sent = [];
  failure = null;
});

function jiraPost(change: Partial<TrackerCommentPost> = {}): TrackerCommentPost {
  return {
    projectId,
    ticketId,
    kind: 'jira',
    itemId: 'ABC-1',
    threadId: null,
    mention: null,
    text: 'Done in https://x.y/pr/7',
    ...change,
  };
}

function notionPost(threadId: string | null): TrackerCommentPost {
  return { ...jiraPost(), kind: 'notion', itemId: 'page-1', threadId, text: 'Done in **#42**' };
}

function logged(): { type: string; payload: unknown }[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type.startsWith('tracker_comment_'))
    .map(({ type, payload }) => ({ type, payload }));
}

/** The first block's inline content of the Jira comment sent, when it is a paragraph. */
function firstParagraph(): unknown[] {
  const body = sent[0]?.body as AdfRichDocument | undefined;
  const block = body?.content[0];
  return block?.type === 'paragraph' ? block.content : [];
}

test('a Jira comment is posted as rich text, and logged with its id', async () => {
  await postTrackerComment(db, apis, 5, jiraPost());
  expect(sent[0]?.target).toBe('ABC-1');
  expect(firstParagraph()).toEqual([
    { type: 'text', text: 'Done in ' },
    {
      type: 'text',
      text: 'https://x.y/pr/7',
      marks: [{ type: 'link', attrs: { href: 'https://x.y/pr/7' } }],
    },
  ]);
  expect(logged()).toEqual([
    {
      type: 'tracker_comment_posted',
      payload: { commandId: 5, kind: 'jira', threadId: null, commentId: '10200' },
    },
  ]);
});

test('a Jira reply starts with a mention of the author', async () => {
  const mention = { accountId: '557058:ada', name: 'Ada' };
  await postTrackerComment(db, apis, 6, jiraPost({ threadId: '10010', mention }));
  expect(firstParagraph().slice(0, 2)).toEqual([
    { type: 'mention', attrs: { id: '557058:ada', text: '@Ada' } },
    { type: 'text', text: ' ' },
  ]);
});

test('a Jira refusal is logged with the text, the comment answered and the permission', async () => {
  failure = new JiraError('This Jira account is not allowed to see this.', FORBIDDEN);
  await postTrackerComment(db, apis, 7, jiraPost({ threadId: '10010' }));
  expect(logged()).toEqual([
    {
      type: 'tracker_comment_failed',
      payload: {
        commandId: 7,
        kind: 'jira',
        threadId: '10010',
        text: 'Done in https://x.y/pr/7',
        error:
          'Jira refused it: the account needs the "Add comments" permission in the Jira project',
      },
    },
  ]);
});

test('a Notion reply goes to its discussion, as rich text', async () => {
  await postTrackerComment(db, apis, 8, notionPost('d1'));
  expect(sent).toEqual([
    {
      target: { discussionId: 'd1' },
      body: [
        expect.objectContaining({ text: { content: 'Done in ', link: null } }),
        expect.objectContaining({ annotations: { bold: true, code: false } }),
      ],
    },
  ]);
  expect(logged()).toMatchObject([
    {
      type: 'tracker_comment_posted',
      payload: { kind: 'notion', threadId: 'd1', commentId: 'c9' },
    },
  ]);
});

test('a Notion page comment goes to the page; a refusal names the capability', async () => {
  failure = new NotionError('Notion: refused', FORBIDDEN);
  await postTrackerComment(db, apis, 9, notionPost(null));
  expect(logged()).toMatchObject([
    { type: 'tracker_comment_failed', payload: { threadId: null, text: 'Done in **#42**' } },
  ]);
  expect(JSON.stringify(logged()[0]?.payload)).toContain('Insert comments');
});

test('a project no longer connected fails without calling the tracker', async () => {
  db.delete(schema.integrations).run();
  await postTrackerComment(db, apis, 10, jiraPost());
  expect(sent).toEqual([]);
  expect(logged()).toMatchObject([
    { type: 'tracker_comment_failed', payload: { error: 'This project is not connected to Jira' } },
  ]);
});

test('the command, and those queued before it, hand the comment to the hook', () => {
  const queue = (type: string, payload: unknown): number =>
    db.insert(schema.commands).values({ type, ticketId, payload }).returning().get().id;
  const ids = [
    queue('post_tracker_comment', jiraPost({ threadId: '10010' })),
    queue('post_notion_comment', {
      projectId,
      ticketId,
      pageId: 'page-1',
      discussionId: 'd1',
      text: 'Hi',
    }),
    queue('post_jira_comment', {
      projectId,
      ticketId,
      key: 'ABC-1',
      text: 'Hi',
      replyTo: { commentId: '10010', accountId: '557058:ada', name: 'Ada' },
    }),
  ];
  const posted: [number, TrackerCommentPost][] = [];
  drainCommands(db, {
    ...NO_HOOKS,
    postTrackerComment: (commandId, comment) => {
      posted.push([commandId, comment]);
    },
  });
  expect(posted).toEqual([
    [ids[0] ?? 0, jiraPost({ threadId: '10010' })],
    [ids[1] ?? 0, { ...notionPost('d1'), text: 'Hi' }],
    [
      ids[2] ?? 0,
      jiraPost({
        threadId: '10010',
        mention: { accountId: '557058:ada', name: 'Ada' },
        text: 'Hi',
      }),
    ],
  ]);
});
