// The pull request's CI checks as the PR tab shows them, and what the user gave the implementer from them.
import type { CiOutput, NewCiOutput } from '@union/core';

export type CheckState = 'pending' | 'passed' | 'failed' | 'skipped';

export type PullRequestCheck = {
  /** `run:<check run id>` (GitHub Actions jobs and CI apps) or `status:<context>` (commit statuses). */
  id: string;
  name: string;
  state: CheckState;
  /** GitHub's conclusion (`failure`, `timed_out`…), a status's state, or null while it runs. */
  conclusion: string | null;
  /** A check run's `output.title`, a status's description. */
  summary: string | null;
  url: string | null;
  /** The workflow run of a GitHub Actions job: its other jobs may hold the findings. */
  workflowRunId: number | null;
  durationMs: number | null;
};

/** A comment a bot posted on the pull request (a CI report, for example). */
export type BotComment = {
  id: number;
  author: string;
  url: string;
  updatedAt: string;
  excerpt: string;
};

export type PullRequestChecks = {
  headSha: string;
  checks: PullRequestCheck[];
  botComments: BotComment[];
};

/**
 * What the user picks for the implementer: a failed check (by its `id`), another Actions job of the
 * head (its check run id), a bot's comment (its id).
 */
export type CiPick = { kind: 'check' | 'job' | 'comment'; id: string };

export type PrChecksView = PullRequestChecks & {
  number: number;
  /** What the user gave the implementer, waiting for its next run or read. */
  given: CiOutput[];
  canSend: boolean;
};

export type CiGivenView = { given: CiOutput[] };

/** The text each pick gives the implementer, built but not stored. */
export type CiPreview = { items: NewCiOutput[] };

/** How many checks of a pull request's head are in each state. */
export type CheckCounts = Record<CheckState, number>;

/** One open slice of a split ticket and its checks; `counts` null when GitHub has no such PR. */
type SliceChecks = { position: number; prNumber: number; counts: CheckCounts | null };

export type StackChecksView = { slices: SliceChecks[] };
