import { afterAll, expect, test } from 'bun:test';

import { Octokit } from 'octokit';

import { OctokitGitHubApi } from './octokit-api';

const NOT_FOUND = 404;
const requests: string[] = [];
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const body = request.method === 'POST' ? await request.text() : '';
    requests.push(`${request.method} ${pathname} ${body}`.trim());
    if (pathname === '/repos/o/r/issues/1') {
      return Response.json({ id: 9001, number: 1 });
    }
    if (pathname === '/repos/o/r/issues/2/dependencies/blocked_by') {
      return request.method === 'GET'
        ? Response.json([
            { number: 1, repository_url: 'https://api.github.com/repos/O/R' },
            { number: 7, repository_url: 'https://api.github.com/repos/o/other' },
          ])
        : Response.json({ number: 2 }, { status: 201 });
    }
    return Response.json({ message: 'Not Found' }, { status: NOT_FOUND });
  },
});
afterAll(() => {
  void server.stop(true);
});

test('"blocked by" uses the dependency endpoints with the blocking issue id', async () => {
  const api = new OctokitGitHubApi(new Octokit({ auth: 't', baseUrl: server.url.origin }));
  const repo = { owner: 'o', repo: 'r' };
  expect(await api.listBlockedBy(repo, 2)).toEqual([1]);
  await api.addBlockedBy(repo, 2, 1);
  expect(requests).toContain('POST /repos/o/r/issues/2/dependencies/blocked_by {"issue_id":9001}');

  // Already gone on GitHub: not an error.
  await api.removeBlockedBy(repo, 2, 1);
  expect(requests.at(-1)).toBe('DELETE /repos/o/r/issues/2/dependencies/blocked_by/9001');
  await api.removeBlockedBy(repo, 2, 5);
  expect(requests.at(-1)).toBe('GET /repos/o/r/issues/5');
});
