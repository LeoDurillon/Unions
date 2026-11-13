// The latest agent review of a change, as the review page reads it: its status, findings count, coverage and slices.
import type { AgentReviewCoverage, AgentReviewSpec, SliceProgress } from '@union/core';

export type AgentReviewView = {
  id: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error: string | null;
  /** Drafts it added, once it succeeded. */
  comments: number | null;
  /** The files it had to review and those it never opened, read from its log; null when not measured. */
  coverage: AgentReviewCoverage | null;
  /** One agent on the whole change, or one per slice then one on the seams. */
  mode: 'single' | 'sliced';
  /** A sliced run's agents and where each stands, the seams' last; null otherwise or before the cut. */
  slices: SliceProgress[] | null;
  /** What it checked the change against; null when it was given none. */
  specs: AgentReviewSpec[] | null;
  /** A stack run's pull requests, bottom first; null for a run on one change. */
  stack: number[] | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};
