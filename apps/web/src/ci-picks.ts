// The user's picks among the pull request's CI, checked against its current checks, then read from GitHub into the text the implementer gets.
import {
  botCommentText,
  failedCheckText,
  relatedJobText,
  type GitHubAuth,
  type NewCiOutput,
} from '@union/core';

import type { CiPick, PullRequestCheck, PullRequestChecks } from './ci-api-types';
import type { CiGitHub } from './github-checks';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND } from './http';

/** A send reads each pick from GitHub: a few at a time keeps it quick. */
const MAX_PICKS = 10;
const KINDS = new Set(['check', 'job', 'comment']);

export type CiSource = { ci: CiGitHub; auth: GitHubAuth; repo: { owner: string; repo: string } };

function isPick(value: unknown): value is CiPick {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof value.kind === 'string' &&
    KINDS.has(value.kind) &&
    'id' in value &&
    typeof value.id === 'string'
  );
}

/** `picks`: 1 to `MAX_PICKS` of `{ kind, id }`. */
export function parsePicks(body: Record<string, unknown>): CiPick[] {
  const { picks } = body;
  if (!Array.isArray(picks) || picks.length === 0 || picks.length > MAX_PICKS) {
    throw fail(BAD_REQUEST, `"picks" must list 1 to ${MAX_PICKS} checks, jobs or comments`);
  }
  if (!picks.every((pick) => isPick(pick))) {
    throw fail(BAD_REQUEST, 'Each pick must be { kind: "check" | "job" | "comment", id }');
  }
  return picks;
}

function listed(listing: PullRequestChecks, id: string): PullRequestCheck {
  const check = listing.checks.find((one) => one.id === id);
  if (!check) {
    throw fail(NOT_FOUND, "That check is not on the pull request's last commit");
  }
  return check;
}

function runId(check: PullRequestCheck): number {
  return Number(check.id.slice('run:'.length));
}

async function checkItem(source: CiSource, check: PullRequestCheck): Promise<string> {
  if (check.state !== 'failed') {
    throw fail(CONFLICT, `${check.name} has not failed`);
  }
  if (!check.id.startsWith('run:')) {
    const output = { title: null, summary: check.summary, text: null };
    return failedCheckText({
      ...check,
      conclusion: check.conclusion ?? 'failure',
      output,
      annotations: [],
      log: null,
    });
  }
  const run = await source.ci.readCheckRun(source.auth, source.repo, runId(check));
  if (!run) {
    throw fail(NOT_FOUND, `${check.name} is gone from GitHub`);
  }
  const log = run.isActions
    ? await source.ci.readJobLog(source.auth, source.repo, runId(check))
    : null;
  return failedCheckText({ ...run, conclusion: run.conclusion ?? 'failure', log });
}

async function jobItem(source: CiSource, check: PullRequestCheck): Promise<string> {
  if (check.workflowRunId === null) {
    throw fail(CONFLICT, `${check.name} is not a GitHub Actions job: GitHub has no log for it`);
  }
  const log = await source.ci.readJobLog(source.auth, source.repo, runId(check));
  if (log === null) {
    throw fail(NOT_FOUND, `The log of ${check.name} is gone (past the repository's retention)`);
  }
  return relatedJobText({ name: check.name, url: check.url, log });
}

async function commentItem(
  source: CiSource,
  listing: PullRequestChecks,
  id: string,
): Promise<NewCiOutput> {
  const comment = listing.botComments.find((one) => String(one.id) === id);
  const read = comment ? await source.ci.readComment(source.auth, source.repo, comment.id) : null;
  if (!comment || !read) {
    throw fail(NOT_FOUND, "That comment is not among the pull request's bot comments");
  }
  return {
    headSha: listing.headSha,
    kind: 'comment',
    name: `${read.author}, comment ${comment.id}`,
    url: read.url,
    text: botCommentText(read),
  };
}

async function itemOf(
  source: CiSource,
  listing: PullRequestChecks,
  pick: CiPick,
): Promise<NewCiOutput> {
  if (pick.kind === 'comment') {
    return commentItem(source, listing, pick.id);
  }
  const check = listed(listing, pick.kind === 'job' ? `run:${pick.id}` : pick.id);
  const text =
    pick.kind === 'check' ? await checkItem(source, check) : await jobItem(source, check);
  return { headSha: listing.headSha, kind: pick.kind, name: check.name, url: check.url, text };
}

/** Each pick's text, read now (job log links expire within a minute), in the order picked. */
export function readPicks(
  source: CiSource,
  listing: PullRequestChecks,
  picks: readonly CiPick[],
): Promise<NewCiOutput[]> {
  return Promise.all(picks.map((pick) => itemOf(source, listing, pick)));
}
