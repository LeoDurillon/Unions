import { afterEach, expect, test } from 'bun:test';

import { FetchJiraApi, type JiraAuth } from './jira-api';
import { JiraError } from './jira-error';

/** What the promise rejects with; fails the test when it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection');
}

const AUTH: JiraAuth = { site: 'https://acme.atlassian.net', email: 'ada@acme.com', token: 'tok' };
const realFetch = globalThis.fetch;

type Seen = { url: string; init: RequestInit | undefined };

/** Answers every request with this response, and records what was asked. */
function answer(response: () => Response): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: input instanceof Request ? input.url : input.toString(), init });
      return Promise.resolve(response());
    },
    { preconnect: realFetch.preconnect },
  );
  return seen;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('calls the site with Basic auth, refusing redirects', async () => {
  const seen = answer(() => json({ accountId: '557058:1', displayName: 'Ada' }));
  expect(await new FetchJiraApi().myself(AUTH)).toEqual({
    accountId: '557058:1',
    displayName: 'Ada',
  });
  const [request] = seen;
  expect(request?.url).toBe('https://acme.atlassian.net/rest/api/3/myself');
  expect(new Headers(request?.init?.headers).get('authorization')).toBe(
    `Basic ${Buffer.from('ada@acme.com:tok').toString('base64')}`,
  );
  expect(request?.init?.redirect).toBe('error');
});

test('never sends the token outside atlassian.net', async () => {
  const seen = answer(() => json({}));
  const api = new FetchJiraApi();
  expect(await rejection(api.myself({ ...AUTH, site: 'https://evil.example' }))).toBeInstanceOf(
    JiraError,
  );
  expect(
    String(await rejection(api.project({ ...AUTH, site: 'http://acme.atlassian.net' }, 'ABC'))),
  ).toContain('atlassian.net');
  expect(seen).toEqual([]);
});

test('reads a project, its statuses once each, and an issue', async () => {
  const api = new FetchJiraApi();
  answer(() =>
    json({
      key: 'ABC',
      name: 'Apollo',
      issueTypes: [{ id: '10001', name: 'Story', subtask: false }],
    }),
  );
  expect(await api.project(AUTH, 'ABC')).toEqual({
    key: 'ABC',
    name: 'Apollo',
    issueTypes: [{ id: '10001', name: 'Story' }],
  });
  const todo = { id: '1', name: 'To Do', statusCategory: { key: 'new' } };
  const done = { id: '3', name: 'Done', statusCategory: { key: 'done' } };
  const seen = answer(() =>
    json([
      { id: '10001', name: 'Story', statuses: [todo, done] },
      { id: '10002', name: 'Bug', statuses: [todo] },
    ]),
  );
  expect(await api.statuses(AUTH, 'ABC')).toEqual([
    { id: '1', name: 'To Do', category: 'new' },
    { id: '3', name: 'Done', category: 'done' },
  ]);
  expect(seen[0]?.url).toBe('https://acme.atlassian.net/rest/api/3/project/ABC/statuses');
  const description = { type: 'doc', version: 1, content: [] };
  const attachment = {
    id: '10100',
    filename: 'screen.png',
    mimeType: 'image/png',
    size: 1234,
    content: 'https://acme.atlassian.net/rest/api/3/attachment/content/10100',
  };
  const issueSeen = answer(() =>
    json({
      key: 'ABC-1',
      fields: {
        summary: 'Add dark mode',
        description,
        project: { key: 'ABC' },
        attachment: [attachment, {}],
      },
    }),
  );
  expect(await api.issue(AUTH, 'ABC-1')).toEqual({
    key: 'ABC-1',
    summary: 'Add dark mode',
    projectKey: 'ABC',
    description,
    attachments: [
      { id: '10100', filename: 'screen.png', mimeType: 'image/png', content: attachment.content },
    ],
  });
  expect(issueSeen[0]?.url).toBe(
    'https://acme.atlassian.net/rest/api/3/issue/ABC-1?fields=summary,description,attachment,project',
  );
});

test('failures say what is wrong, with their status', async () => {
  const api = new FetchJiraApi();
  const cases: [Response, number, string][] = [
    [json({}, 401), 401, 'rejected this email and API token'],
    [json({}, 403), 403, 'not allowed'],
    [json({ errorMessages: ['No project could be found'] }, 404), 404, 'Not found'],
    [json({}, 429, { 'retry-after': '30' }), 429, 'try again in 30 s'],
    [
      json({ errorMessages: ['Boom.'], errors: { summary: 'Required.' } }, 400),
      400,
      'Jira: Boom. Required.',
    ],
    [new Response('<html>', { status: 503 }), 503, 'HTTP 503'],
  ];
  for (const [response, status, message] of cases) {
    answer(() => response);
    const failure = await rejection(api.project(AUTH, 'ABC'));
    expect(failure).toBeInstanceOf(JiraError);
    expect(failure).toMatchObject({ status });
    expect(String(failure)).toContain(message);
  }
});

test("an attachment's media id is read from its redirect, without following it", async () => {
  const api = new FetchJiraApi();
  const id = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
  const location = `https://api.media.atlassian.com/file/${id}/binary?token=t&client=c&dl=true`;
  const seen = answer(() => new Response(null, { status: 303, headers: { location } }));
  expect(await api.attachmentMediaId(AUTH, '10100')).toBe(id);
  expect(seen[0]?.url).toBe('https://acme.atlassian.net/rest/api/3/attachment/content/10100');
  expect(seen[0]?.init?.redirect).toBe('manual');
  expect(new Headers(seen[0]?.init?.headers).get('authorization')).toStartWith('Basic ');
  for (const other of [
    new Response('bytes'),
    new Response(null, { status: 303, headers: { location: 'https://example.com/elsewhere' } }),
    new Response(null, {
      status: 303,
      headers: { location: `http://api.media.atlassian.com/file/${id}/binary` },
    }),
  ]) {
    answer(() => other);
    expect(await api.attachmentMediaId(AUTH, '10100')).toBeNull();
  }
});

test('reads the settable fields from GET /field', async () => {
  const seen = answer(() =>
    json([
      { id: 'customfield_10050', name: 'PR link', schema: { type: 'string' } },
      { id: 'assignee', name: 'Assignee', schema: { type: 'user' } },
    ]),
  );
  expect(await new FetchJiraApi().fields(AUTH)).toEqual([
    { id: 'customfield_10050', name: 'PR link', type: 'text' },
  ]);
  expect(seen[0]?.url).toBe('https://acme.atlassian.net/rest/api/3/field');
});

test('writes send JSON, and read an empty 204 answer as done', async () => {
  const api = new FetchJiraApi();
  const seen = answer(() => new Response(null, { status: 204 }));
  await api.transitionIssue(AUTH, 'ABC-1', '31');
  await api.updateIssue(AUTH, 'ABC-1', { fields: { customfield_1: 'x' }, update: {} });
  await api.addComment(AUTH, 'ABC-1', { type: 'doc', version: 1, content: [] });
  expect(seen.map(({ url, init }) => [init?.method, url, init?.body])).toEqual([
    [
      'POST',
      'https://acme.atlassian.net/rest/api/3/issue/ABC-1/transitions',
      JSON.stringify({ transition: { id: '31' } }),
    ],
    [
      'PUT',
      'https://acme.atlassian.net/rest/api/3/issue/ABC-1',
      JSON.stringify({ fields: { customfield_1: 'x' }, update: {} }),
    ],
    [
      'POST',
      'https://acme.atlassian.net/rest/api/3/issue/ABC-1/comment',
      JSON.stringify({ body: { type: 'doc', version: 1, content: [] } }),
    ],
  ]);
  expect(new Headers(seen[0]?.init?.headers).get('content-type')).toBe('application/json');
});

test("reads an issue's transitions, status and edit screen", async () => {
  const api = new FetchJiraApi();
  answer(() =>
    json({
      transitions: [{ id: '31', name: 'Start review', to: { id: '3', name: 'In Review' } }],
    }),
  );
  expect(await api.transitions(AUTH, 'ABC-1')).toEqual([
    { id: '31', name: 'Start review', toId: '3', toName: 'In Review' },
  ]);
  answer(() => json({ fields: { status: { id: '1', name: 'To Do' } } }));
  expect(await api.issueStatus(AUTH, 'ABC-1')).toEqual({ id: '1', name: 'To Do' });
  answer(() =>
    json({
      fields: {
        customfield_3: {
          allowedValues: [
            { id: '10', value: 'Low' },
            { id: '11', value: 'High' },
          ],
        },
        labels: { schema: { type: 'array' } },
      },
    }),
  );
  expect(await api.editMeta(AUTH, 'ABC-1')).toEqual({
    customfield_3: { allowedValues: ['Low', 'High'] },
    labels: { allowedValues: null },
  });
});

/** A page of `count` comments, newest first from `first` down, of an issue that has `total`. */
function commentPage(first: number, count: number, total: number): unknown {
  const comments = Array.from({ length: count }, (_, index) => ({
    id: String(first - index),
    author: { displayName: 'Ada' },
    body: { type: 'doc', content: [] },
    created: '2026-11-07T09:00:00.000+0000',
  }));
  return { startAt: 0, maxResults: 100, total, comments };
}

test("an issue's comments are read newest first, then shown oldest first", async () => {
  const seen = answer(() => json(commentPage(3, 3, 3)));
  const read = await new FetchJiraApi().comments(AUTH, 'ABC-1');
  expect(read.comments.map((comment) => comment.id)).toEqual(['1', '2', '3']);
  expect(read.total).toBe(3);
  expect(seen.map((request) => request.url)).toEqual([
    'https://acme.atlassian.net/rest/api/3/issue/ABC-1/comment?orderBy=-created&startAt=0&maxResults=100',
  ]);
});

test('a long issue keeps its last 500 comments and says how many it has', async () => {
  let page = 0;
  const seen = answer(() => {
    const newest = 650 - page * 100;
    page += 1;
    return json(commentPage(newest, 100, 650));
  });
  const read = await new FetchJiraApi().comments(AUTH, 'ABC-1');
  expect(seen).toHaveLength(5);
  expect(read.total).toBe(650);
  expect(read.comments).toHaveLength(500);
  expect([read.comments[0]?.id, read.comments.at(-1)?.id]).toEqual(['151', '650']);
});
