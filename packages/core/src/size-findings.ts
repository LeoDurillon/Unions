// The usage finding on change sizes: tickets whose first implementation went far over the plan's estimate.
import { SIZE_TOLERANCE } from './change-budget';
import { finding, type Finding } from './usage-findings';

/** One `change_measured` event, oldest first, as the finding reads it. */
export type SizeRecord = {
  ticketId: number;
  code: number;
  budget: number | null;
  phase: 'implemented' | 'trimmed';
};

const PERCENT = 100;

/**
 * Each ticket's first measure with a budget, when it went over the tolerance: `value` is the
 * change's size in percent of its budget, `calls` its lines of code.
 */
export function sizeFindings(records: SizeRecord[]): Finding[] {
  const first = new Map<number, SizeRecord & { budget: number }>();
  for (const record of records) {
    const { budget } = record;
    if (record.phase === 'implemented' && budget !== null && !first.has(record.ticketId)) {
      first.set(record.ticketId, { ...record, budget });
    }
  }
  const items = [...first.values()]
    .filter((record) => record.code > record.budget * SIZE_TOLERANCE)
    .map((record) => ({
      label: '',
      value: Math.round((record.code / record.budget) * PERCENT),
      calls: record.code,
      tickets: [record.ticketId],
    }));
  const found = finding('over_estimate', 'union', items);
  return found === null ? [] : [found];
}
