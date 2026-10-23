// Splits the log at each run header, so every run can fold on its own.
/** A run of the log: its header line (none for lines logged before any run) and its lines. */
export type LogRun<T> = { key: string; header: T | null; lines: T[] };

/** Splits the log at each run header, so every run can fold on its own. */
export function groupRuns<T extends { key: string }>(
  entries: T[],
  isHeader: (entry: T) => boolean,
): LogRun<T>[] {
  const runs: LogRun<T>[] = [];
  for (const entry of entries) {
    const current = runs.at(-1);
    if (isHeader(entry)) {
      runs.push({ key: entry.key, header: entry, lines: [] });
    } else if (current) {
      current.lines.push(entry);
    } else {
      runs.push({ key: 'before', header: null, lines: [entry] });
    }
  }
  return runs;
}
