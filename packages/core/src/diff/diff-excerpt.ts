// The text of lines on one side of a file's patch, and the part of a range a line comment can take.
import { parsePatch, type DiffLine } from './diff';
import { hunksOf, type Hunk } from './diff-hunks';

function lineNumber(line: DiffLine, side: 'old' | 'new'): number | null {
  if (line.kind === 'context') {
    return side === 'old' ? line.oldLine : line.newLine;
  }
  if (line.kind === 'add') {
    return side === 'new' ? line.newLine : null;
  }
  return line.kind === 'del' && side === 'old' ? line.oldLine : null;
}

/** The text of `start..end` on one side of a file's patch; null when none of those lines is in it. */
export function diffExcerpt(
  patch: string,
  side: 'old' | 'new',
  start: number,
  end: number,
): string | null {
  const picked = parsePatch(patch).filter((line) => {
    const number = lineNumber(line, side);
    return number !== null && number >= start && number <= end;
  });
  return picked.length === 0
    ? null
    : picked.map((line) => ('text' in line ? line.text : '')).join('\n');
}

export type LineSpan = { startLine: number; endLine: number };

/** The lines a hunk covers on one side: a pure addition has none on the old side, nor a pure removal on the new. */
function hunkSpan(hunk: Hunk, side: 'old' | 'new'): LineSpan | null {
  const first = side === 'old' ? hunk.oldStart : hunk.newStart;
  const count = side === 'old' ? hunk.oldLines : hunk.newLines;
  return count === 0 ? null : { startLine: first, endLine: first + count - 1 };
}

/**
 * The part of `start..end` GitHub takes a line comment on: inside the first hunk it overlaps (a
 * comment cannot span the gap between two hunks, nor reach past one); null when it overlaps none.
 */
export function rangeInDiff(
  patch: string,
  side: 'old' | 'new',
  start: number,
  end: number,
): LineSpan | null {
  for (const hunk of hunksOf(patch)) {
    const span = hunkSpan(hunk, side);
    if (span && span.startLine <= end && span.endLine >= start) {
      return { startLine: Math.max(start, span.startLine), endLine: Math.min(end, span.endLine) };
    }
  }
  return null;
}
