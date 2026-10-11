import type { DiffLine } from '@union/core/diff';

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
