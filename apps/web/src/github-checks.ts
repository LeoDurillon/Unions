// The web's reads of a pull request's CI: its checks and bot comments, and what a pick gives the agent (a check's annotations, a job's log, a comment).
import type { CheckAnnotation, GitHubAuth } from '@union/core';
import { githubClient, type ClientOptions } from '@union/core/github-client';
import type { Octokit } from 'octokit';

import type { PullRequestChecks } from './ci-api-types';
import { toBotComments, toCheck, toStatusCheck } from './github-check-parse';
import { orNull } from './github-repo-reads';

type Repo = { owner: string; repo: string };

export type CheckRunRead = {
  name: string;
  conclusion: string | null;
  url: string | null;
  output: { title: string | null; summary: string | null; text: string | null };
  annotations: CheckAnnotation[];
  /** Run by GitHub Actions: its id is the job's, whose log GitHub keeps. */
  isActions: boolean;
};

/**
 * GitHub reads for the PR tab's checks, beside `OnboardingGitHub`. Each is null when the thing does
 * not exist (a job log past its retention included). Tests use a fake.
 */
export type CiGitHub = {
  listChecks(auth: GitHubAuth, repo: Repo, number: number): Promise<PullRequestChecks | null>;
  readCheckRun(auth: GitHubAuth, repo: Repo, id: number): Promise<CheckRunRead | null>;
  readJobLog(auth: GitHubAuth, repo: Repo, jobId: number): Promise<string | null>;
  readComment(
    auth: GitHubAuth,
    repo: Repo,
    id: number,
  ): Promise<{ author: string; url: string; body: string } | null>;
};

const PER_PAGE = 100;
const GONE = 410;
const LEVELS = new Set(['notice', 'warning', 'failure']);

function isLevel(level: string | null | undefined): level is CheckAnnotation['level'] {
  return typeof level === 'string' && LEVELS.has(level);
}

async function listFor(client: Octokit, repo: Repo, number: number): Promise<PullRequestChecks> {
  const { data: pr } = await client.rest.pulls.get({ ...repo, pull_number: number });
  const ref = pr.head.sha;
  const [runs, status, comments] = await Promise.all([
    client.paginate(client.rest.checks.listForRef, { ...repo, ref, per_page: PER_PAGE }),
    client.rest.repos.getCombinedStatusForRef({ ...repo, ref, per_page: PER_PAGE }),
    client.paginate(client.rest.issues.listComments, {
      ...repo,
      issue_number: number,
      per_page: PER_PAGE,
    }),
  ]);
  return {
    headSha: ref,
    checks: [
      ...runs.map((run) => toCheck(run)),
      ...status.data.statuses.map((one) => toStatusCheck(one)),
    ],
    botComments: toBotComments(comments),
  };
}

async function readRun(client: Octokit, repo: Repo, id: number): Promise<CheckRunRead> {
  const { data } = await client.rest.checks.get({ ...repo, check_run_id: id });
  const annotations = await client.paginate(client.rest.checks.listAnnotations, {
    ...repo,
    check_run_id: id,
    per_page: PER_PAGE,
  });
  return {
    name: data.name,
    conclusion: data.conclusion,
    url: data.html_url,
    output: { title: data.output.title, summary: data.output.summary, text: data.output.text },
    annotations: annotations.flatMap((note) =>
      isLevel(note.annotation_level)
        ? [
            {
              path: note.path,
              startLine: note.start_line,
              level: note.annotation_level,
              message: note.message ?? '',
            },
          ]
        : [],
    ),
    isActions: data.app?.slug === 'github-actions',
  };
}

/** Octokit follows the log's redirect; the download URL GitHub gives expires after a minute. */
async function readLog(client: Octokit, repo: Repo, jobId: number): Promise<string | null> {
  try {
    const { data } = await client.rest.actions.downloadJobLogsForWorkflowRun({
      ...repo,
      job_id: jobId,
    });
    return typeof data === 'string' ? data : String(data);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === GONE) {
      return null;
    }
    throw error;
  }
}

/** The Octokit `CiGitHub`, one client per credential. */
export class OctokitCi implements CiGitHub {
  constructor(private readonly options: ClientOptions = {}) {}

  private client(auth: GitHubAuth): Octokit {
    return githubClient(auth, this.options);
  }

  listChecks(auth: GitHubAuth, repo: Repo, number: number): Promise<PullRequestChecks | null> {
    return orNull(() => listFor(this.client(auth), repo, number));
  }

  readCheckRun(auth: GitHubAuth, repo: Repo, id: number): Promise<CheckRunRead | null> {
    return orNull(() => readRun(this.client(auth), repo, id));
  }

  readJobLog(auth: GitHubAuth, repo: Repo, jobId: number): Promise<string | null> {
    return orNull(() => readLog(this.client(auth), repo, jobId));
  }

  readComment(
    auth: GitHubAuth,
    repo: Repo,
    id: number,
  ): Promise<{ author: string; url: string; body: string } | null> {
    return orNull(async () => {
      const { data } = await this.client(auth).rest.issues.getComment({ ...repo, comment_id: id });
      return { author: data.user?.login ?? 'ghost', url: data.html_url, body: data.body ?? '' };
    });
  }
}
