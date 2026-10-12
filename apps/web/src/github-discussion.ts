import type { Octokit } from 'octokit';

import type { PullRequestDiscussion, PullRequestNote, PullRequestThread } from './api-types';
import { PULL_REQUEST_NOTES, PULL_REQUEST_THREADS } from './github-queries';

type Author = { __typename?: string; login: string } | null;

type RawComment = {
  author: Author;
  body: string;
  url: string;
  createdAt: string;
  diffHunk: string;
  originalCommit: { oid: string } | null;
};

export type RawThread = {
  isResolved: boolean;
  path: string;
  diffSide: 'LEFT' | 'RIGHT';
  line: number | null;
  startLine: number | null;
  originalLine: number | null;
  originalStartLine: number | null;
  comments: { nodes: (RawComment | null)[] };
};

type RawNote = { author: Author; body: string; url: string; createdAt: string; state?: string };

type PullRequestData<T> = { repository: { pullRequest: T | null } | null };

type ThreadPage = PullRequestData<{
  reviewThreads: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: (RawThread | null)[];
  };
}>;

type NotesData = PullRequestData<{
  reviews: { nodes: (RawNote | null)[] };
  comments: { nodes: (RawNote | null)[] };
}>;

/** Stops a runaway pull request: 20 pages of 50 threads. */
const MAX_PAGES = 20;

/** A deleted account shows as "ghost", as on GitHub. */
function login(author: Author): string {
  return author?.login ?? 'ghost';
}

/** GitHub's shape to ours: LEFT is the old side. */
export function toThread(raw: RawThread): PullRequestThread {
  const comments = raw.comments.nodes.flatMap((comment) =>
    comment
      ? [
          {
            author: login(comment.author),
            body: comment.body,
            url: comment.url,
            createdAt: comment.createdAt,
            diffHunk: comment.diffHunk,
            commitSha: comment.originalCommit?.oid ?? '',
          },
        ]
      : [],
  );
  return {
    resolved: raw.isResolved,
    path: raw.path,
    side: raw.diffSide === 'LEFT' ? 'old' : 'new',
    line: raw.line,
    startLine: raw.startLine,
    originalLine: raw.originalLine,
    originalStartLine: raw.originalStartLine,
    comments,
  };
}

/** Reviews without a summary (a bare approval, or one made only of line comments) are left out. */
export function toNotes(
  reviews: readonly (RawNote | null)[],
  comments: readonly (RawNote | null)[],
): PullRequestNote[] {
  const note = (raw: RawNote, kind: PullRequestNote['kind']): PullRequestNote => ({
    kind,
    author: login(raw.author),
    bot: raw.author?.__typename === 'Bot',
    body: raw.body,
    url: raw.url,
    state: raw.state ?? null,
    createdAt: raw.createdAt,
  });
  return [
    ...reviews.flatMap((raw) => (raw && raw.body.trim() !== '' ? [note(raw, 'review')] : [])),
    ...comments.flatMap((raw) => (raw ? [note(raw, 'comment')] : [])),
  ].toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function fetchThreads(
  octokit: Octokit,
  variables: { owner: string; repo: string; number: number },
): Promise<PullRequestThread[] | null> {
  const threads: PullRequestThread[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: ThreadPage = await octokit.graphql<ThreadPage>(PULL_REQUEST_THREADS, {
      ...variables,
      after,
    });
    const pull = data.repository?.pullRequest;
    if (!pull) {
      return null;
    }
    const { nodes, pageInfo } = pull.reviewThreads;
    threads.push(...nodes.flatMap((node) => (node ? [toThread(node)] : [])));
    if (!pageInfo.hasNextPage) {
      break;
    }
    after = pageInfo.endCursor;
  }
  return threads;
}

/** The pull request's line threads, review summaries and conversation comments; null when it does not exist. */
export async function fetchDiscussion(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  number: number,
): Promise<PullRequestDiscussion | null> {
  const variables = { ...repo, number };
  const [threads, notes] = await Promise.all([
    fetchThreads(octokit, variables),
    octokit.graphql<NotesData>(PULL_REQUEST_NOTES, variables),
  ]);
  const pull = notes.repository?.pullRequest;
  if (!threads || !pull) {
    return null;
  }
  return { threads, notes: toNotes(pull.reviews.nodes, pull.comments.nodes) };
}
