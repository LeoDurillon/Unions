// The prompts of a sliced agent review: one agent per slice of the change, then one on how the slices fit.
// Each slice agent reviews its own files and hunks but may read anything; the seams agent gets
// every slice's findings and the spec parts no change implements.

import { hunksOf, type AgentReviewSpec, type Db, type ReviewSlice } from '@union/core';

import { changeFiles, filesSection, readingSection, reviewHeader } from './agent-review-change';
import { FINDINGS_FORMAT } from './agent-review-findings';
import type { PartAnswer } from './agent-review-merge';
import type { ReviewTarget } from './agent-review-target';

/** A finding's first line in the seams prompt, at most this long. */
const MAX_FINDING_TEXT = 200;

const SEAMS_READING =
  'Open the files you need to check where the parts meet: the callers of what changed, the types both sides share, the tests across parts.';

/** The change of a sliced review: what is reviewed, its specs and its slices. */
export type SlicedChange = {
  target: ReviewTarget;
  specs: AgentReviewSpec[] | null;
  slices: readonly ReviewSlice[];
};

/** A spec part the grouping found no change for. */
export type MissingPart = { spec: string; note: string };

function quoted(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/** A slice's files: whole, or the hunks it owns, named by their start line in the hunk index. */
function sliceFiles(slice: ReviewSlice, target: ReviewTarget): string {
  return slice.files
    .map((file) => {
      if (file.hunks === null) {
        return `- \`${file.path}\` (${file.lines} lines)`;
      }
      const keys = new Set(file.hunks);
      const starts = hunksOf(target.patchOf(file.path) ?? '')
        .filter((hunk) => keys.has(hunk.key))
        .map((hunk) => hunk.newStart);
      return `- \`${file.path}\`, only its hunks at lines ${starts.join(', ')} (${file.lines} lines)`;
    })
    .join('\n');
}

function partSection(slices: readonly ReviewSlice[], index: number): string {
  const slice = slices[index];
  if (!slice) {
    return '';
  }
  const others = slices
    .flatMap((other, at) => (at === index ? [] : [`- ${other.title} (${other.lines} lines)`]))
    .join('\n');
  const spec =
    slice.spec === ''
      ? ''
      : `\nThe part of the specification it implements:\n\n${quoted(slice.spec)}\n`;
  const summary = slice.summary === '' ? '' : `\n${slice.summary}\n`;
  return `This change is too large for one review: it is cut into ${slices.length} parts, each reviewed by its own agent, then one more agent looks at how they fit together. You review part ${index + 1}: **${slice.title}**.
${spec}${summary}
The other parts, which other agents review:

${others}

Comment on your part's lines. Read anything else you need to follow a call, a type or a test, in any part: a bug often sits where two parts meet. Comment on another part's lines only for a real problem you are sure of.`;
}

/** The prompt of the agent reviewing `slices[index]`. */
export function slicePrompt(db: Db, change: SlicedChange, index: number): string {
  const { target, specs, slices } = change;
  const slice = slices[index];
  const lines = slice?.lines ?? 0;
  const files = `Your part's files, ${slice?.files.length ?? 0} with ${lines} changed lines:\n\n${slice ? sliceFiles(slice, target) : ''}`;
  return `${reviewHeader(db, target, specs)}
## Your part

${partSection(slices, index)}

## How to read it

${readingSection(target, files)}

## Your answer

${FINDINGS_FORMAT}`;
}

function clip(text: string): string {
  const [first = ''] = text.split('\n');
  return first.length > MAX_FINDING_TEXT ? `${first.slice(0, MAX_FINDING_TEXT)}…` : first;
}

function answerLines(slice: ReviewSlice, answer: PartAnswer | undefined): string {
  const files = slice.files.map((file) => `\`${file.path}\``).join(', ');
  const found =
    answer?.findings === null || answer === undefined
      ? `  Not reviewed: ${answer?.error ?? 'no answer'}.`
      : answer.findings.comments
          .map((finding) => `  - \`${finding.path}:${finding.startLine}\`: ${clip(finding.body)}`)
          .join('\n');
  return `- **${slice.title}** (${files})\n${found === '' ? '  No comment.' : found}`;
}

/** The prompt of the agent that reviews how the slices fit together, once they answered. */
export function seamsPrompt(
  db: Db,
  change: SlicedChange,
  answers: readonly PartAnswer[],
  missing: readonly MissingPart[],
): string {
  const { target, specs, slices } = change;
  const parts = slices.map((slice, index) => answerLines(slice, answers[index])).join('\n');
  const gaps =
    missing.length === 0
      ? ''
      : `\nParts of the specification the grouping found no change for: check them.\n\n${missing.map((part) => `- ${clip(part.spec)}: ${part.note}`).join('\n')}\n`;
  return `${reviewHeader(db, target, specs)}
## Your part: how the parts fit together

This change was reviewed in ${slices.length} parts by separate agents. Each read its own files and commented on them:

${parts}
${gaps}
Look only at how the parts fit together: a function, a type or a contract changed in one part and used in another, a migration or a schema against the code that reads it, a test that no longer tests what its code does, a part of the specification no change implements. Do not repeat their comments. In your \`summary\`, say in a few lines what the change does as a whole and what matters most before it is merged.

## How to read it

${readingSection(target, filesSection(changeFiles(db, target)), SEAMS_READING)}

## Your answer

${FINDINGS_FORMAT}`;
}
