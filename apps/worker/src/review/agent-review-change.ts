// The agent review of one change, a ticket's or a pull request's: its prompt, and what of the change it opened.
// The prompt lists the files to review with their size, sets the hidden ones apart, and asks for
// the diff one file at a time; the coverage is read from the run's log after it.

import {
  agentReviewLog,
  hunksOf,
  isIgnoredPath,
  resolveAgent,
  reviewCoverage,
  sharedPrompt,
  specsSection,
  type AgentReviewCoverage,
  type AgentReviewSpec,
  type Db,
  type ReviewedFile,
} from '@union/core';

import { REPO_DIR } from '../provision';
import { FINDINGS_FORMAT } from './agent-review-findings';
import { loadProject, type ReviewTarget } from './agent-review-target';
import { HUNK_INDEX } from './review-grouping-format';

/** The change's files: those to review, and those the review page hides (lock files, the project's patterns). */
export type ChangeFiles = { review: ReviewedFile[]; hidden: ReviewedFile[] };

export function changeFiles(db: Db, target: ReviewTarget): ChangeFiles {
  const { config } = loadProject(db, target.projectId);
  const patterns = config.reviewIgnore ?? [];
  const hideLockFiles = config.hideLockFiles !== false;
  const files = target.paths.map((path) => ({
    path,
    lines: hunksOf(target.patchOf(path) ?? '').reduce(
      (sum, hunk) => sum + hunk.additions + hunk.deletions,
      0,
    ),
  }));
  const hidden = (file: ReviewedFile): boolean => isIgnoredPath(file.path, patterns, hideLockFiles);
  return {
    review: files.filter((file) => !hidden(file)),
    hidden: files.filter((file) => hidden(file)),
  };
}

function fileLines(files: ReviewedFile[]): string {
  return files.map((file) => `- \`${file.path}\` (${file.lines} lines)`).join('\n');
}

export function filesSection({ review, hidden }: ChangeFiles): string {
  const lines = review.reduce((sum, file) => sum + file.lines, 0);
  const list = `Its files to review, ${review.length} with ${lines} changed lines:\n\n${fileLines(review)}`;
  return hidden.length === 0
    ? list
    : `${list}\n\nFiles the review page hides (lock files, the project's patterns): open one only when a change above depends on it.\n\n${fileLines(hidden)}`;
}

const REVIEW_EVERY_FILE =
  'Review every file of the list, its tests and docs included: a test belongs with the code it tests and a doc with what it describes, and either can contradict it. Start where the change starts (what it adds to the API, the schema or the entry points) and follow it through. If you could not read some files, name them at the start of your `summary`.';

/** How to read the change, around `files` (the list of what to review) and what to do with it. */
export function readingSection(
  target: ReviewTarget,
  files: string,
  closing = REVIEW_EVERY_FILE,
): string {
  return `The change is checked out in the repository root, at HEAD. Its commits: \`git log ${target.base}..HEAD\`. A file's changes: \`git diff ${target.base}...HEAD -- <path>\`. Read any file you need. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

Diff one file per call, or a few small files of one folder. Never diff the whole change or a large folder at once: a long output is cut to a preview, and the line numbers you would cite are no longer the file's. Every hunk is listed, file by file, in \`${HUNK_INDEX}\`.

${files}

${closing}`;
}

/**
 * The prompt's start, the same for every agent of a review: the instructions, the review agent's
 * prompt, what is reviewed and its specs. `specs` null: the ticket's own text stands in for them.
 */
export function reviewHeader(
  db: Db,
  target: ReviewTarget,
  specs: AgentReviewSpec[] | null,
): string {
  const specText = specs === null ? '' : specsSection(specs);
  return `${sharedPrompt(db, target.projectId)}

${resolveAgent(db, 'review_comments').prompt}

## What you review

${specs === null ? target.about : target.brief}
${specText === '' ? '' : `\n${specText}\n`}`;
}

/** The prompt of a review in one pass. */
export function changeReviewPrompt(
  db: Db,
  target: ReviewTarget,
  specs: AgentReviewSpec[] | null,
): string {
  return `${reviewHeader(db, target, specs)}
## How to read it

${readingSection(target, filesSection(changeFiles(db, target)))}

## Your answer

${FINDINGS_FORMAT}`;
}

/** The files to review that the agent review `agentReviewId` never opened, read from its log. */
export function changeCoverage(
  db: Db,
  target: ReviewTarget,
  agentReviewId: number,
): AgentReviewCoverage {
  return reviewCoverage(
    agentReviewLog(db, agentReviewId),
    changeFiles(db, target).review,
    REPO_DIR,
  );
}
