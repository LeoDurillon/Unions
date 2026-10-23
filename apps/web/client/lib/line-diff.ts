// The lines of `after` against `before`: kept, added or removed, in reading order.
export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

/** Past this many lines on a side the texts are shown as replaced whole: the table grows as their product. */
const MAX_LINES = 1500;

/** The longest common subsequence table, filled from the ends. */
function commonLengths(before: string[], after: string[]): number[][] {
  const table = Array.from({ length: before.length + 1 }, () =>
    Array.from({ length: after.length + 1 }, () => 0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const row = table[i] ?? [];
      row[j] =
        before[i] === after[j]
          ? (table[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(table[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  return table;
}

/** The next line at `i` in `before` and `j` in `after`, following the table. */
function nextLine(
  before: string[],
  after: string[],
  table: number[][],
  [i, j]: [number, number],
): DiffLine {
  const old = before[i];
  const next = after[j];
  if (old !== undefined && old === next) {
    return { kind: 'same', text: old };
  }
  // On a tie the removal comes first: a changed line reads as old, then new.
  const removeFirst = next === undefined || (table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0);
  return old !== undefined && removeFirst
    ? { kind: 'removed', text: old }
    : { kind: 'added', text: next ?? '' };
}

/** The lines of `after` against `before`: kept, added or removed, in reading order. */
export function lineDiff(beforeText: string, afterText: string): DiffLine[] {
  const before = beforeText === '' ? [] : beforeText.split('\n');
  const after = afterText === '' ? [] : afterText.split('\n');
  if (before.length > MAX_LINES || after.length > MAX_LINES) {
    return [
      ...before.map((text): DiffLine => ({ kind: 'removed', text })),
      ...after.map((text): DiffLine => ({ kind: 'added', text })),
    ];
  }
  const table = commonLengths(before, after);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    const line = nextLine(before, after, table, [i, j]);
    lines.push(line);
    i += line.kind === 'added' ? 0 : 1;
    j += line.kind === 'removed' ? 0 : 1;
  }
  return lines;
}
