import { afterAll, expect, test } from 'bun:test';

import { Octokit } from 'octokit';

import { OctokitGitHubApi } from './octokit-api';

const head = (state: string | null): unknown => ({
  repository: {
    pullRequest: {
      commits: {
        nodes: [{ commit: { oid: 'abc', statusCheckRollup: state === null ? null : { state } } }],
      },
    },
  },
});

/** Pull request number → GraphQL's answer. */
const ANSWERS: Record<number, unknown> = {
  1: { data: head('ERROR') },
  2: { data: head(null) },
  3: {
    data: head(null),
    errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }],
  },
  4: { data: { repository: { pullRequest: null } } },
};

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const { variables } = (await request.json()) as { variables: { number: number } };
    return Response.json(
      ANSWERS[variables.number] ?? { errors: [{ type: 'INTERNAL', message: 'boom' }] },
    );
  },
});
afterAll(() => {
  void server.stop(true);
});

async function failure(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

test("the head's checks are read from the rollup; no permission reads as none", async () => {
  const api = new OctokitGitHubApi(new Octokit({ auth: 't', baseUrl: server.url.origin }));
  const repo = { owner: 'o', repo: 'r' };
  expect(await api.pullRequestChecks(repo, 1)).toEqual({ sha: 'abc', state: 'failure' });
  expect(await api.pullRequestChecks(repo, 2)).toEqual({ sha: 'abc', state: null });
  expect(await api.pullRequestChecks(repo, 3)).toBeNull();
  expect(await api.pullRequestChecks(repo, 4)).toBeNull();
  expect(await failure(api.pullRequestChecks(repo, 5))).toContain('boom');
});
