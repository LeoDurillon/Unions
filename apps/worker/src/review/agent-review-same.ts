// Folds the comments of a sliced review that report the same problem in different places into one.
// The seams prompt numbers the parts' comments, part after part; the seams agent names each group's
// numbers in `same`. A group keeps one comment (the first on lines its part owns, else the first),
// which names the other places.

import { lastJsonBlock, type Findings } from './agent-review-findings';
import type { PartAnswer } from './agent-review-merge';

type Finding = Findings['comments'][number];

/** A part's comment and its number in the seams prompt. */
export type Numbered = { number: number; part: number; finding: Finding };

/** What the seams agent adds to the findings format. */
export const SAME_FORMAT =
  '- `same`: groups of the numbered comments above that report one problem in different places, e.g. `[[3, 12]]`; `[]` when none. Union keeps one comment of each group and names the other places in it.';

/** The parts' comments, numbered from 1 in order, part after part. */
export function numberedFindings(parts: readonly PartAnswer[]): Numbered[] {
  const numbered: Numbered[] = [];
  for (const [part, answer] of parts.entries()) {
    for (const finding of answer.findings?.comments ?? []) {
      numbered.push({ number: numbered.length + 1, part, finding });
    }
  }
  return numbered;
}

function isNumberList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

/** The seams agent's `same` groups; none when its answer has no such field. */
export function parseSame(answer: string): number[][] {
  const parsed = lastJsonBlock(answer);
  if (typeof parsed !== 'object' || parsed === null || !('same' in parsed)) {
    return [];
  }
  const { same } = parsed;
  return Array.isArray(same) ? same.filter((group) => isNumberList(group)) : [];
}

function withPlaces(finding: Finding, others: readonly Finding[]): Finding {
  const places = others.map((other) => `\`${other.path}:${other.startLine}\``).join(', ');
  return { ...finding, body: `${finding.body}\n\nThe same problem at ${places}.` };
}

/** What folding the groups gave: the comments kept, and the new text of those that name others. */
export type Folded<T> = { kept: T[]; folded: Map<number, Finding> };

/** Folds one group into `result`: its numbers not folded yet, when at least two are left. */
function foldGroup<T extends Numbered & { owned: boolean }>(
  group: readonly number[],
  byNumber: ReadonlyMap<number, T>,
  used: Set<number>,
  result: { dropped: Set<number>; folded: Map<number, Finding> },
): void {
  const members = [...new Set(group)]
    .filter((number) => !used.has(number))
    .flatMap((number) => byNumber.get(number) ?? []);
  const keeper = members.find((member) => member.owned) ?? members[0];
  if (members.length < 2 || !keeper) {
    return;
  }
  const others = members.filter((member) => member !== keeper);
  for (const member of members) {
    used.add(member.number);
  }
  for (const other of others) {
    result.dropped.add(other.number);
  }
  result.folded.set(
    keeper.number,
    withPlaces(
      keeper.finding,
      others.map((other) => other.finding),
    ),
  );
}

/** `entries` with each `same` group folded into one comment, whose new text names the other places. */
export function foldSame<T extends Numbered & { owned: boolean }>(
  entries: readonly T[],
  same: readonly (readonly number[])[],
): Folded<T> {
  const byNumber = new Map(entries.map((entry) => [entry.number, entry]));
  const used = new Set<number>();
  const result = { dropped: new Set<number>(), folded: new Map<number, Finding>() };
  for (const group of same) {
    foldGroup(group, byNumber, used, result);
  }
  return {
    kept: entries.filter((entry) => !result.dropped.has(entry.number)),
    folded: result.folded,
  };
}
