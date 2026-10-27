// The part of a review agent's prompt that says where the change is and how to read it: its diff, its
// files and the index of its hunks.
import type { ReviewTarget } from './agent-review-target';
import { HUNK_INDEX } from './review-grouping-format';

export function checkedOutChange(target: ReviewTarget): string {
  return `${target.about}

The change is checked out in the repository root, at HEAD. Read it with \`git diff ${target.base}...HEAD\` (one file at a time when it is large: \`git diff ${target.base}...HEAD -- <path>\`) and read any file you need. Run one git command per call: no \`&&\`, no \`cd\`. Do not change any file.

Its changed files:

${target.paths.map((path) => `- ${path}`).join('\n')}

Every hunk of the diff is listed, file by file, in \`${HUNK_INDEX}\`: read it, and name hunks by the line it gives them.`;
}
