// Runs a sliced agent review: cuts the change, one agent per slice in turn, one on the seams, then merges.
// Every agent runs in the same checkout in a fresh session; the slices' progress is saved as they
// go, for the review page. A failed slice is named in the summary; only all failing fails the review.

import {
  setAgentReviewSlices,
  type AgentReview,
  type AgentReviewOutcome,
  type ReviewSlice,
  type SliceProgress,
} from '@union/core';

import type { AgentReviewDeps } from './agent-review';
import { answerOf, askReviewAgent } from './agent-review-ask';
import { changeCoverage } from './agent-review-change';
import { cutChange } from './agent-review-cut';
import { toDrafts } from './agent-review-findings';
import { MAX_SLICED_COMMENTS, mergeSliced, type PartAnswer } from './agent-review-merge';
import { seamsPrompt, slicePrompt } from './agent-review-slice-prompt';
import type { ReviewTarget } from './agent-review-target';
import type { ChangedFile } from './hunk-index-file';

const SEAMS_TITLE = 'How the parts fit together';

/** What a sliced run needs: the review, its checked-out change and its hunks, and its stop signal. */
export type SlicedRun = {
  row: AgentReview;
  target: ReviewTarget;
  files: ChangedFile[];
  signal: AbortSignal;
};

const CANCELLED: AgentReviewOutcome = { status: 'cancelled' };

function queued(title: string, files: number, lines: number): SliceProgress {
  return { title, files, lines, status: 'queued', comments: null, error: null };
}

/** The agents' progress, saved on the review at each change. */
class Progress {
  private readonly entries: SliceProgress[];

  constructor(
    private readonly deps: AgentReviewDeps,
    private readonly id: number,
    slices: readonly ReviewSlice[],
  ) {
    const all = slices.flatMap((slice) => slice.files);
    this.entries = [
      ...slices.map((slice) => queued(slice.title, slice.files.length, slice.lines)),
      queued(
        SEAMS_TITLE,
        all.length,
        all.reduce((sum, file) => sum + file.lines, 0),
      ),
    ];
    this.save();
  }

  private save(): void {
    setAgentReviewSlices(this.deps.db, this.id, this.entries);
  }

  start(index: number): void {
    this.set(index, { status: 'running' });
  }

  finish(index: number, answer: PartAnswer): void {
    this.set(index, {
      status: answer.findings ? 'succeeded' : 'failed',
      comments: answer.findings?.comments.length ?? null,
      error: answer.error,
    });
  }

  private set(index: number, patch: Partial<SliceProgress>): void {
    const current = this.entries[index];
    if (current) {
      this.entries[index] = { ...current, ...patch };
      this.save();
    }
  }
}

/** Runs the sliced review `run.row` on its checked-out change. */
export async function runSlicedReview(
  deps: AgentReviewDeps,
  run: SlicedRun,
): Promise<AgentReviewOutcome> {
  const { row, target, signal } = run;
  const where = { row, container: target.container, signal };
  // A function, not `signal.aborted`: TypeScript would keep it narrowed across the awaits.
  const stopped = (): boolean => signal.aborted;
  const cut = await cutChange(deps.db, run, (prompt) =>
    askReviewAgent(deps, where, 'review_groups', prompt),
  );
  if (stopped()) {
    return CANCELLED;
  }
  const change = { target, specs: row.specs, slices: cut.slices };
  const progress = new Progress(deps, row.id, cut.slices);
  const parts: PartAnswer[] = [];
  for (const [index, slice] of cut.slices.entries()) {
    progress.start(index);
    const prompt = slicePrompt(deps.db, change, index);
    const answer = answerOf(
      slice.title,
      await askReviewAgent(deps, where, 'review_comments', prompt),
    );
    if (stopped()) {
      return CANCELLED;
    }
    progress.finish(index, answer);
    parts.push(answer);
  }
  if (parts.every((part) => part.findings === null)) {
    return {
      status: 'failed',
      error: `No part could be reviewed: ${parts[0]?.error ?? 'no part'}`,
    };
  }
  const seamsIndex = cut.slices.length;
  progress.start(seamsIndex);
  const prompt = seamsPrompt(deps.db, change, parts, cut.missing);
  const seams = answerOf(SEAMS_TITLE, await askReviewAgent(deps, where, 'review_comments', prompt));
  if (stopped()) {
    return CANCELLED;
  }
  progress.finish(seamsIndex, seams);
  const merged = mergeSliced(cut.slices, parts, seams, target.patchOf);
  const findings = {
    ...merged,
    summary: `${merged.summary}\n\nThe parts come from ${cut.source}.`,
  };
  return {
    status: 'succeeded',
    headSha: target.headSha,
    drafts: toDrafts(findings, target.patchOf, MAX_SLICED_COMMENTS),
    coverage: changeCoverage(deps.db, target, row.id),
  };
}
