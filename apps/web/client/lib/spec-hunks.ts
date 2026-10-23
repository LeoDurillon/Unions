// What a file opened under a part of the spec shows: that part's hunks, and the parts each hunk
// serves.
import { hunkKey, hunksOf, type Hunk } from '@union/core/diff-hunks';

import type { GroupingView } from '../../src/routes/review-groupings';

type Result = NonNullable<GroupingView['result']>;

/** The part a file was opened from: a group's key, or the changes no part asked for. */
export const UNRELATED_PART = 'unrelated';

/** What the open file shows of a part: its title, and its hunks (null: the whole file). */
export type Focus = { title: string; keys: string[] | null };

/** The hunks of `path` that serve the part; null when the file serves it whole, or the part is unknown. */
export function focusOf(result: Result, part: string, path: string): Focus | null {
  if (part === UNRELATED_PART) {
    const entries = result.unrelated.filter((entry) => entry.path === path);
    if (entries.length === 0) {
      return null;
    }
    const whole = entries.some((entry) => entry.hunks === undefined);
    return {
      title: 'Not in the spec',
      keys: whole ? null : entries.flatMap((entry) => entry.hunks ?? []),
    };
  }
  const group = result.groups.find((candidate) => candidate.key === part);
  if (!group?.files.includes(path)) {
    return null;
  }
  return { title: group.title, keys: group.hunks?.[path] ?? null };
}

/** How many of the file's hunks serve the part, when only some do: for the file's row. */
export function partialCount(result: Result, part: string, path: string): number | null {
  return focusOf(result, part, path)?.keys?.length ?? null;
}

/** By hunk key, the titles of the parts each hunk of the file serves ("Not in the spec" included). */
export function hunkTags(
  result: Result,
  path: string,
  hunks: readonly Hunk[],
): Map<string, string[]> {
  const tags = new Map<string, string[]>(hunks.map((hunk) => [hunk.key, []]));
  const parts = [
    ...result.groups.map((group) => group.key),
    ...(result.unrelated.some((entry) => entry.path === path) ? [UNRELATED_PART] : []),
  ];
  for (const part of parts) {
    const focus = focusOf(result, part, path);
    for (const key of focus ? (focus.keys ?? [...tags.keys()]) : []) {
      tags.get(key)?.push(focus?.title ?? '');
    }
  }
  return tags;
}

/** Whether a comment's line is in one of the hunks shown (on its own side of the diff). */
export function inHunks(
  hunks: readonly Hunk[],
  comment: { side: 'old' | 'new'; endLine: number },
): boolean {
  return hunks.some((hunk) => {
    const start = comment.side === 'new' ? hunk.newStart : hunk.oldStart;
    const count = comment.side === 'new' ? hunk.newLines : hunk.oldLines;
    return comment.endLine >= start && comment.endLine < start + count;
  });
}

/** The key of a hunk header line, as the diff renders it. */
export function headerKey(header: string): string | null {
  const [hunk] = hunksOf(header);
  return hunk ? hunkKey(hunk.oldStart, hunk.newStart) : null;
}
