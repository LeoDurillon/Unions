// A ticket's size budget: the estimate in its approved technical plan, else the project's default, and whether a change goes over it (browser-safe).
import type { ChangeSize } from './change-size';

/** How far over its budget a change may go before the implementer is asked to cut: estimates are rough. */
export const SIZE_TOLERANCE = 1.5;

export type ChangeBudget = { lines: number; source: 'estimate' | 'project' };

/** The line the technical step ends with, in English whatever the ticket's language. */
const ESTIMATE = /estimated size\W*?(?<lines>\d[\d,  ]*)\s*lines/giu;

/** The last `Estimated size: <n> lines` of a technical plan; null when it has none. */
export function parseSizeEstimate(text: string): number | null {
  const last = [...text.matchAll(ESTIMATE)].at(-1)?.groups?.lines;
  if (last === undefined) {
    return null;
  }
  const lines = Number(last.replaceAll(/[,  ]/gu, ''));
  return Number.isInteger(lines) && lines > 0 ? lines : null;
}

/** The plan's estimate, else the project's default; null: no budget, the size is only shown. */
export function changeBudget(
  technical: string | null,
  config: { sizeBudget?: number },
): ChangeBudget | null {
  const estimate = technical === null ? null : parseSizeEstimate(technical);
  if (estimate !== null) {
    return { lines: estimate, source: 'estimate' };
  }
  return config.sizeBudget === undefined ? null : { lines: config.sizeBudget, source: 'project' };
}

/** Over the budget by more than the tolerance: the implementer is asked to cut. */
export function isOverBudget(size: ChangeSize, budget: ChangeBudget | null): boolean {
  return budget !== null && size.code > budget.lines * SIZE_TOLERANCE;
}

/** "312 lines of code (+840 tests, +12 other), 41 removed", with the budget when there is one. */
export function describeSize(size: ChangeSize, budget: ChangeBudget | null): string {
  const extra = [
    size.tests > 0 ? `+${size.tests} tests` : '',
    size.other > 0 ? `+${size.other} other` : '',
  ].filter((part) => part !== '');
  const lines = `${size.code} lines of code${extra.length > 0 ? ` (${extra.join(', ')})` : ''}`;
  const removed = size.removed > 0 ? `, ${size.removed} removed` : '';
  if (budget === null) {
    return `${lines}${removed}`;
  }
  const of = budget.source === 'estimate' ? 'estimated' : 'project budget';
  return `${lines}${removed}, for ~${budget.lines} ${of}`;
}
