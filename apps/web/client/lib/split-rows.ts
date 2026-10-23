// Pairs a patch's lines for side-by-side display: a context line faces itself, and each run of
// removed lines faces the added lines that follow it, row by row; the longer run gets empty cells.
import type { DiffLine } from '@union/core/diff';

type OldLine = Extract<DiffLine, { kind: 'del' | 'context' }>;
type NewLine = Extract<DiffLine, { kind: 'add' | 'context' }>;

/** One row of the split view: a full-width header or note, or the old and new line side by side. */
export type SplitRow =
  | { kind: 'full'; line: Extract<DiffLine, { kind: 'hunk' | 'meta' }> }
  | { kind: 'pair'; left: OldLine | null; right: NewLine | null };

/**
 * Pairs a patch's lines for side-by-side display: a context line faces itself, and each run of
 * removed lines faces the added lines that follow it, row by row; the longer run gets empty cells.
 */
export function splitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let removed: OldLine[] = [];
  let added: NewLine[] = [];
  const flush = (): void => {
    const length = Math.max(removed.length, added.length);
    for (let index = 0; index < length; index++) {
      rows.push({ kind: 'pair', left: removed[index] ?? null, right: added[index] ?? null });
    }
    removed = [];
    added = [];
  };
  for (const line of lines) {
    if (line.kind === 'del') {
      if (added.length > 0) {
        flush();
      }
      removed.push(line);
    } else if (line.kind === 'add') {
      added.push(line);
    } else {
      flush();
      rows.push(
        line.kind === 'context'
          ? { kind: 'pair', left: line, right: line }
          : { kind: 'full', line },
      );
    }
  }
  flush();
  return rows;
}
