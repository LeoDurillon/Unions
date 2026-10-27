// What the change does that no requirement asked for: the agent's list, checked against the diff, and
// every changed file it placed nowhere.
import { hunkAt, hunksOf, REPORT_LEVELS, type OutOfScopeChange } from '@union/core';

import { oneOf, records, text, type Parsed } from './review-report-fields';

const NOT_PLACED = 'Not placed by the agent';

/** The hunks the cited lines fall in; none (the whole file) without lines or hunks. */
function hunksCited(patch: string, lines: unknown): string[] {
  const hunks = hunksOf(patch);
  const numbers = Array.isArray(lines)
    ? lines.filter((line): line is number => typeof line === 'number')
    : [];
  return [...new Set(numbers.flatMap((line) => hunkAt(hunks, line)?.key ?? []))];
}

/**
 * The changes no requirement asked for: the agent's, on files of the diff, then each changed file
 * that is neither a requirement's evidence (`placed`) nor in the agent's list.
 */
export function outOfScopeOf(
  value: unknown,
  files: { path: string; patch: string }[],
  placed: ReadonlySet<string>,
): Parsed<OutOfScopeChange> {
  const raw = records(value);
  const items: OutOfScopeChange[] = [];
  for (const item of raw) {
    const file = files.find((candidate) => candidate.path === text(item.path));
    if (file) {
      items.push({
        path: file.path,
        hunks: hunksCited(file.patch, item.lines),
        reason: text(item.reason),
        risk: oneOf(REPORT_LEVELS, item.risk) ?? 'medium',
      });
    }
  }
  const dropped = raw.length - items.length;
  const listed = new Set(items.map((item) => item.path));
  for (const file of files) {
    if (!placed.has(file.path) && !listed.has(file.path)) {
      items.push({ path: file.path, hunks: [], reason: NOT_PLACED, risk: 'medium' });
    }
  }
  return { items, dropped };
}
