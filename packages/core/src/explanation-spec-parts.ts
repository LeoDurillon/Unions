// The parts of a grouping by spec that selected lines of a file touch, without asking an agent. Pure.
import { hunksOf, type Hunk } from './diff-hunks';
import type { GroupingResult } from './schema-review-groupings';

/** A part of the spec the lines belong to, as the grouping named and quoted it. */
export type SpecPart = { key: string; title: string; spec: string };

export type LineRange = { side: 'old' | 'new'; start: number; end: number };

function overlaps(hunk: Hunk, range: LineRange): boolean {
  const first = range.side === 'new' ? hunk.newStart : hunk.oldStart;
  const count = range.side === 'new' ? hunk.newLines : hunk.oldLines;
  const last = first + Math.max(count, 1) - 1;
  return range.start <= last && range.end >= first;
}

/**
 * The grouping's parts that hold the file and, when they list its hunks, one the lines fall in. A
 * selection between hunks (a context line) still names the parts holding the whole file.
 */
export function explanationSpecParts(
  grouping: GroupingResult,
  file: { path: string; patch: string },
  range: LineRange,
): SpecPart[] {
  const touched = new Set(
    hunksOf(file.patch)
      .filter((hunk) => overlaps(hunk, range))
      .map((hunk) => hunk.key),
  );
  return grouping.groups
    .filter((group) => {
      if (!group.files.includes(file.path)) {
        return false;
      }
      const keys = group.hunks?.[file.path];
      return keys === undefined || keys.some((key) => touched.has(key));
    })
    .map(({ key, title, spec }) => ({ key, title, spec }));
}
