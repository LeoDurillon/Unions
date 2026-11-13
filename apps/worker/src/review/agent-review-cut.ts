// Cuts the change of a sliced agent review: from the grouping by spec of its head, one run now, or by folder.
// A grouping the user ran on the same head is reused; with specs and none, the grouping agent
// runs first (its result is not saved as the page's grouping); without specs, or when it fails,
// the change is cut by folder. Files the review page hides are left out.

import {
  groupingText,
  hunksOf,
  latestGrouping,
  slicesByFolder,
  slicesFromGrouping,
  type AgentReview,
  type AgentReviewOwner,
  type Db,
  type GroupingResult,
  type ReviewSlice,
} from '@union/core';

import type { AgentOutcome } from '../agent/agent';
import { changeFiles } from './agent-review-change';
import type { MissingPart } from './agent-review-slice-prompt';
import type { ReviewTarget } from './agent-review-target';
import type { ChangedFile } from './hunk-index-file';
import { groupingPrompt } from './review-grouping-prompt';
import { parseGrouping } from './review-grouping-result';

/** The slices to review, the spec parts no change implements, and where the slices come from. */
export type Cut = { slices: ReviewSlice[]; missing: MissingPart[]; source: string };

/** Runs the grouping agent on the change. */
export type AskGrouping = (prompt: string) => Promise<AgentOutcome>;

function ownerOf(row: AgentReview): AgentReviewOwner {
  return row.ticketId === null
    ? { kind: 'review', id: row.reviewId ?? 0 }
    : { kind: 'ticket', id: row.ticketId };
}

/** The grouping the user ran on this very head, if any. */
function savedGrouping(db: Db, row: AgentReview, headSha: string): GroupingResult | null {
  const grouping = latestGrouping(db, ownerOf(row));
  return grouping?.status === 'succeeded' && grouping.headSha === headSha ? grouping.result : null;
}

/** The review to cut, its checked-out change and the change's files with their patches. */
export type CutRun = { row: AgentReview; target: ReviewTarget; files: ChangedFile[] };

async function freshGrouping(
  db: Db,
  run: CutRun,
  ask: AskGrouping,
): Promise<GroupingResult | null> {
  const { row, target, files } = run;
  const specs = (row.specs ?? []).filter((spec) => spec.text.trim() !== '');
  if (specs.length === 0) {
    return null;
  }
  const outcome = await ask(groupingPrompt(db, target, groupingText(specs)));
  return outcome.kind === 'ok' ? parseGrouping(outcome.text, files) : null;
}

/** The slices of the change of the sliced review `run.row`. */
export async function cutChange(db: Db, run: CutRun, ask: AskGrouping): Promise<Cut> {
  const { row, target, files } = run;
  const hidden = new Set(changeFiles(db, target).hidden.map((file) => file.path));
  const sources = files
    .filter((file) => !hidden.has(file.path))
    .map((file) => ({ path: file.path, hunks: hunksOf(file.patch) }));
  const saved = savedGrouping(db, row, target.headSha);
  const grouping = saved ?? (await freshGrouping(db, run, ask));
  if (!grouping) {
    return { slices: slicesByFolder(sources), missing: [], source: 'by folder' };
  }
  return {
    slices: slicesFromGrouping(grouping, sources),
    missing: grouping.missing,
    source: saved ? 'the grouping by spec' : 'a new grouping by spec',
  };
}
