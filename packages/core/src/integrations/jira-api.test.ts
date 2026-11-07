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
