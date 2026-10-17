// GitHub's check runs, commit statuses and comments to the PR tab's shape: states, workflow runs, bot comments.
import type { BotComment, CheckState, PullRequestCheck } from './ci-api-types';

export type RawCheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  details_url?: string | null;
  started_at: string | null;
  completed_at: string | null;
  output: { title: string | null };
};

export type RawStatus = {
  context: string;
  state: string;
  description: string | null;
  target_url: string | null;
};

export type RawComment = {
  id: number;
  html_url: string;
  updated_at: string;
  body?: string;
  user: { login: string; type: string } | null;
};

const FAILED = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);
const SKIPPED = new Set(['cancelled', 'skipped', 'neutral', 'stale']);
const WORKFLOW_RUN = /\/actions\/runs\/(?<run>\d+)\/job\/\d+/u;
export const MAX_BOT_COMMENTS = 20;
const EXCERPT_CHARS = 200;
/** Bots hide markers in HTML comments; they read as noise in an excerpt. */
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;

/** Cancelled, skipped and neutral runs are not failures the agent could fix. */
export function checkRunState(status: string, conclusion: string | null): CheckState {
  if (status !== 'completed' || conclusion === null) {
    return 'pending';
  }
  if (FAILED.has(conclusion)) {
    return 'failed';
  }
  return SKIPPED.has(conclusion) ? 'skipped' : 'passed';
}

export function statusState(state: string): CheckState {
  if (state === 'success') {
    return 'passed';
  }
  return state === 'pending' ? 'pending' : 'failed';
}

/** The workflow run of an Actions job, from its link (`/actions/runs/<run>/job/<job>`). */
export function workflowRunOf(url: string | null | undefined): number | null {
  const run = WORKFLOW_RUN.exec(url ?? '')?.groups?.run;
  return run === undefined ? null : Number(run);
}

function duration(start: string | null, end: string | null): number | null {
  return start === null || end === null ? null : Date.parse(end) - Date.parse(start);
}

export function toCheck(run: RawCheckRun): PullRequestCheck {
  return {
    id: `run:${run.id}`,
    name: run.name,
    state: checkRunState(run.status, run.conclusion),
    conclusion: run.status === 'completed' ? run.conclusion : null,
    summary: run.output.title,
    url: run.html_url,
    workflowRunId: workflowRunOf(run.html_url ?? run.details_url),
    durationMs: duration(run.started_at, run.completed_at),
  };
}

export function toStatusCheck(status: RawStatus): PullRequestCheck {
  return {
    id: `status:${status.context}`,
    name: status.context,
    state: statusState(status.state),
    conclusion: status.state,
    summary: status.description,
    url: status.target_url,
    workflowRunId: null,
    durationMs: null,
  };
}

/** Comments from bots, newest edit first (bots often update one comment in place). */
export function toBotComments(comments: readonly RawComment[]): BotComment[] {
  return comments
    .filter((comment) => comment.user?.type === 'Bot')
    .toSorted((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, MAX_BOT_COMMENTS)
    .map((comment) => ({
      id: comment.id,
      author: comment.user?.login ?? 'ghost',
      url: comment.html_url,
      updatedAt: comment.updated_at,
      excerpt: (comment.body ?? '').replaceAll(HTML_COMMENT, '').trim().slice(0, EXCERPT_CHARS),
    }));
}
