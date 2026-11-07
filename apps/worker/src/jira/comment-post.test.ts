import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  JiraError,
  migrateDb,
  saveIntegration,
  schema,
  type AdfDocument,
  type Db,
  type JiraApi,
  type JiraCommentPost,
} from '@union/core';

import { postJiraComment } from './comment-post';

let db: Db;
let post: JiraCommentPost;
let sent: { key: string; body: AdfDocument }[];
let failure: Error | null;

const jira = {
  addComment: (_auth, key, body) => {
    if (failure) {
      return Promise.reject(failure);
    }
    sent.push({ key, body });
    return Promise.resolve({ id: '10200' });
  },
} satisfies Partial<JiraApi> as unknown as JiraApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  const ticketId = createTicket(db, { projectId, title: 'Dark mode' }).id;
  post = { projectId, ticketId, key: 'ABC-1', text: 'Done in https://x.y/pr/7', replyTo: null };
  sent = [];
  failure = null;
});

function logged(): { type: string; payload: unknown }[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type.startsWith('jira_comment_'))
    .map(({ type, payload }) => ({ type, payload }));
}

test('a new comment is posted as rich text, and logged with its id', async () => {
  await postJiraComment(db, jira, 5, post);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.key).toBe('ABC-1');
  expect(sent[0]?.body.content[0]?.content.map((part) => part.type)).toEqual(['text', 'text']);
  expect(logged()).toEqual([
    { type: 'jira_comment_posted', payload: { commandId: 5, commentId: '10200' } },
  ]);
});

test('a reply starts with a mention of the author', async () => {
  const replyTo = { commentId: '10010', accountId: '557058:ada', name: 'Ada' };
  await postJiraComment(db, jira, 6, { ...post, replyTo });
  expect(sent[0]?.body.content[0]?.content[0]).toEqual({
    type: 'mention',
    attrs: { id: '557058:ada', text: '@Ada' },
  });
});

test('a refusal is logged with the text, the comment answered and the permission it needs', async () => {
  failure = new JiraError('This Jira account is not allowed to see this.', 403);
  const replyTo = { commentId: '10010', accountId: '557058:ada', name: 'Ada' };
  await postJiraComment(db, jira, 7, { ...post, replyTo });
  expect(logged()).toEqual([
    {
      type: 'jira_comment_failed',
      payload: {
        commandId: 7,
        replyTo: '10010',
        text: post.text,
        error:
          'Jira refused it: the account needs the "Add comments" permission in the Jira project',
      },
    },
  ]);
});

test('a project no longer connected fails without calling Jira', async () => {
  db.delete(schema.integrations).run();
  await postJiraComment(db, jira, 8, post);
  expect(sent).toEqual([]);
  expect(logged()).toMatchObject([
    { type: 'jira_comment_failed', payload: { error: 'This project is not connected to Jira' } },
  ]);
});
