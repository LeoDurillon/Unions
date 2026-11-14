// Merges a sliced review's findings: each slice's, then the seams', duplicates kept once, into one answer.
// A comment on lines its slice owns comes before one another slice made on them, so the owner's
// wins a duplicate; comments the seams agent found to be one problem are folded into one. The
// summary says what each part found, or why it failed.

import { hunksOf, type ReviewSlice } from '@union/core';

import type { Findings } from './agent-review-findings';
import { foldSame, numberedFindings } from './agent-review-same';

type Finding = Findings['comments'][number];

/** What one agent of the sliced review answered: its findings, or why it has none. */
export type PartAnswer = {
  title: string;
  findings: Findings | null;
  error: string | null;
  /** The seams agent's groups of the parts' comments that are one problem, by number. */
  same?: number[][];
};

/** At most this many comments in a sliced review, its parts' together. */
export const MAX_SLICED_COMMENTS = 60;

type Range = { side: 'old' | 'new'; start: number; end: number };

/** The line ranges `slice` owns in each of its files; null for a file it owns whole. */
function ownedRanges(
  slice: ReviewSlice,
  patchOf: (path: string) => string | undefined,
): Map<string, Range[] | null> {
  return new Map(
    slice.files.map((file) => {
      if (file.hunks === null) {
        return [file.path, null];
      }
      const keys = new Set(file.hunks);
      const ranges = hunksOf(patchOf(file.path) ?? '')
        .filter((hunk) => keys.has(hunk.key))
        .flatMap((hunk): Range[] => [
          { side: 'new', start: hunk.newStart, end: hunk.newStart + hunk.newLines - 1 },
          { side: 'old', start: hunk.oldStart, end: hunk.oldStart + hunk.oldLines - 1 },
        ]);
      return [file.path, ranges];
    }),
  );
}

function overlaps(finding: Finding, range: { start: number; end: number }): boolean {
  return finding.startLine <= range.end && range.start <= finding.endLine;
}

/** Whether `finding` is on lines `slice` owns. */
export function isOwned(
  finding: Finding,
  slice: ReviewSlice,
  patchOf: (path: string) => string | undefined,
): boolean {
  const owned = ownedRanges(slice, patchOf);
  if (!owned.has(finding.path)) {
    return false;
  }
  const ranges = owned.get(finding.path);
  return ranges === null || ranges === undefined
    ? true
    : ranges.some((range) => range.side === finding.side && overlaps(finding, range));
}

function sameSpot(a: Finding, b: Finding): boolean {
  return (
    a.path === b.path && a.side === b.side && overlaps(a, { start: b.startLine, end: b.endLine })
  );
}

function partLine(part: PartAnswer): string {
  if (part.findings === null) {
    return `- **${part.title}**: not reviewed (${part.error ?? 'no answer'}).`;
  }
  const summary = part.findings.summary === '' ? 'nothing to add.' : part.findings.summary;
  return `- **${part.title}** (${part.findings.comments.length} comments): ${summary}`;
}

/** The seams agent's line: its summary is already the review's remark, so only its count. */
function seamsLine(seams: PartAnswer): string {
  return seams.findings === null
    ? partLine(seams)
    : `- **${seams.title}** (${seams.findings.comments.length} comments).`;
}

/** The parts' comments, each group the seams agent found the same folded, those on owned lines first. */
function ordered(answers: SlicedAnswers, patchOf: (path: string) => string | undefined): Finding[] {
  const { slices, parts, same } = answers;
  const entries = numberedFindings(parts).map((entry) => {
    const slice = slices[entry.part];
    const owned = slice !== undefined && isOwned(entry.finding, slice, patchOf);
    return { number: entry.number, part: entry.part, finding: entry.finding, owned };
  });
  const { kept, folded } = foldSame(entries, same);
  return [...kept.filter((entry) => entry.owned), ...kept.filter((entry) => !entry.owned)].map(
    (entry) => folded.get(entry.number) ?? entry.finding,
  );
}

/**
 * What a sliced review's agents answered: `slices[i]` answered `parts[i]`, then the seams agent,
 * which named in `same` the parts' comments (numbered part after part) that are one problem.
 */
export type SlicedAnswers = {
  slices: readonly ReviewSlice[];
  parts: readonly PartAnswer[];
  seams: PartAnswer;
  same: readonly number[][];
};

/**
 * One answer from the parts' and the seams': each group of the same problem folded into one
 * comment, comments on owned lines first, then the others, then the seams', a comment on lines one
 * before it covers dropped.
 */
export function mergeSliced(
  answers: SlicedAnswers,
  patchOf: (path: string) => string | undefined,
): Findings {
  const { parts, seams } = answers;
  const kept: Finding[] = [];
  for (const finding of [...ordered(answers, patchOf), ...(seams.findings?.comments ?? [])]) {
    if (!kept.some((other) => sameSpot(other, finding))) {
      kept.push(finding);
    }
  }
  const whole = seams.findings?.summary ?? '';
  const lines = [...parts.map((part) => partLine(part)), seamsLine(seams)].join('\n');
  return {
    summary: `${whole === '' ? '' : `${whole}\n\n`}Reviewed in ${parts.length} parts, then how they fit together:\n\n${lines}`,
    comments: kept.slice(0, MAX_SLICED_COMMENTS),
  };
}
