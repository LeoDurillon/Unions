import { afterAll, expect, test } from 'bun:test';

import { Octokit } from 'octokit';

import { listIssuesSince } from './octokit-issue-list';

const NOT_FOUND = 404;
const queries: string[] = [];
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/repos/o/r/issues') {
      return Response.json({ message: 'Not Found' }, { status: NOT_FOUND });
    }
    queries.push(url.search);
    return Response.json([
      { number: 1, title: 'An issue', body: null, updated_at: '2026-11-07T10:00:00Z' },
      { number: 2, title: 'A PR', body: 'x', updated_at: '2026-11-07T11:00:00Z', pull_request: {} },
    ]);
  },
});
afterAll(() => {
  void server.stop(true);
});

test('lists issues updated since a time, open and closed, without pull requests', async () => {
  const octokit = new Octokit({ auth: 't', baseUrl: server.url.origin });
  const repo = { owner: 'o', repo: 'r' };
  expect(await listIssuesSince(octokit, repo, '2026-11-07T09:00:00Z')).toEqual([
    { number: 1, title: 'An issue', body: '', updatedAt: '2026-11-07T10:00:00Z' },
  ]);
  const params = new URLSearchParams(queries[0]);
  expect(params.get('since')).toBe('2026-11-07T09:00:00Z');
  expect(params.get('state')).toBe('all');

  await listIssuesSince(octokit, repo, null);
  expect(new URLSearchParams(queries[1]).has('since')).toBe(false);
});
