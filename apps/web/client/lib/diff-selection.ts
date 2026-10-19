import type { DiffLine } from '@union/core/diff';
import { hunksOf, type Hunk } from '@union/core/diff-hunks';

export type Side = 'old' | 'new';
export type Selection = { side: Side; start: number; end: number };

/** Which side and number a rendered line is commented on: removed lines on the old side, others on the new. */
export function anchorOf(line: DiffLine): { side: Side; number: number } | null {
  switch (line.kind) {
    case 'add':
    case 'context': {
      return { side: 'new', number: line.newLine };
    }
    case 'del': {
      return { side: 'old', number: line.oldLine };
    }
    case 'hunk':
    case 'meta': {
      return null;
    }
    default: {
      return null;
    }
  }
}

/** A click starts a selection; a shift-click on the same side extends it to a block. */
export function select(
  current: Selection | null,
  side: Side,
  number: number,
  extend: boolean,
): Selection {
  if (extend && current?.side === side) {
    return { side, start: Math.min(current.start, number), end: Math.max(current.end, number) };
  }
  return { side, start: number, end: number };
}

export function isSelected(selection: Selection | null, side: Side, number: number): boolean {
  return (
    selection !== null &&
    selection.side === side &&
    number >= selection.start &&
    number <= selection.end
  );
}

function rangeOf(hunk: Hunk): Selection {
  return hunk.newLines > 0
    ? { side: 'new', start: hunk.newStart, end: hunk.newStart + hunk.newLines - 1 }
    : { side: 'old', start: hunk.oldStart, end: hunk.oldStart + Math.max(hunk.oldLines, 1) - 1 };
}

/** The lines of the hunk a `@@` header opens: its new side, or its old one when it only removes. */
export function hunkSelection(header: string): Selection | null {
  const [hunk] = hunksOf(header);
  return hunk ? rangeOf(hunk) : null;
}

/** The whole file's changed lines, first hunk to last, on the new side (the old one when it is deleted). */
export function fileSelection(patch: string): Selection | null {
  const hunks = hunksOf(patch);
  const ranges = hunks.map((hunk) => rangeOf(hunk));
  const side = ranges.some((range) => range.side === 'new') ? 'new' : 'old';
  const own = ranges.filter((range) => range.side === side);
  const [first] = own;
  const last = own.at(-1);
  return first && last ? { side, start: first.start, end: last.end } : null;
}
