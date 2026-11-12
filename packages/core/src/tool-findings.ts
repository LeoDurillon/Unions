// What a project's agents' tool uses say to improve: large outputs, many forms of the checks, files
// read again, refusals. Also skills loaded again.
import { finding, topTickets, type Finding, type FindingItem } from './usage-findings';

/** A ticket's uses of one tool key, summed over its calls. */
export type ToolRecord = {
  ticketId: number | null;
  tool: string;
  target: string;
  variant: string;
  subagent: boolean;
  calls: number;
  denied: number;
  resultBytes: number;
};

/** A command whose results in the calls' own sessions add up to more than this, in characters… */
const LARGE_OUTPUT = 200_000;
/** …and average more than this per call: reading code piece by piece is not a large output. */
const LARGE_EACH = 5000;
/** A check run in more forms than this. */
const MANY_FORMS = 5;
/** A file read in at least this many tickets. */
const READ_TICKETS = 3;
/** More refusals than this. */
const MANY_DENIED = 10;
/** A skill loaded more times than this. */
const MANY_SKILLS = 10;

const CHECK =
  /^(?:jest|vitest|tsc|eslint|oxlint|biome|prettier|playwright|turbo|mocha|pytest|cargo|go)$|test|lint|check|typecheck/u;

function isCheck(record: ToolRecord): boolean {
  return record.tool === 'Bash' && !record.target.startsWith('git ') && CHECK.test(record.target);
}

/** Files Union writes for its agents (`.git/union-*`), not the repository's. */
const UNION_FILE = /^$|^\.git\//u;

type Group = { calls: number; value: number; forms: Set<string>; byTicket: Map<number, number> };

function add(groups: Map<string, Group>, label: string, record: ToolRecord, value: number): void {
  const entry: Group = groups.get(label) ?? {
    calls: 0,
    value: 0,
    forms: new Set(),
    byTicket: new Map(),
  };
  entry.calls += record.calls;
  entry.value += value;
  entry.forms.add(record.variant);
  if (record.ticketId !== null) {
    entry.byTicket.set(record.ticketId, (entry.byTicket.get(record.ticketId) ?? 0) + value);
  }
  groups.set(label, entry);
}

/** The records summed per label, with each ticket's share of `measure`. */
function group(
  records: ToolRecord[],
  labelOf: (record: ToolRecord) => string | null,
  measure: (record: ToolRecord) => number,
): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const record of records) {
    const label = labelOf(record);
    if (label !== null) {
      add(groups, label, record, measure(record));
    }
  }
  return groups;
}

function items(groups: Map<string, Group>, value: (entry: Group) => number): FindingItem[] {
  return [...groups].map(([label, entry]) => ({
    label,
    value: value(entry),
    calls: entry.calls,
    tickets: topTickets(entry.byTicket),
  }));
}

function largeOutputs(records: ToolRecord[]): Finding | null {
  const groups = group(
    records,
    (record) => (record.tool === 'Bash' && !record.subagent ? record.target : null),
    (record) => record.resultBytes,
  );
  const found = items(groups, (entry) => entry.value).filter(
    (item) => item.value > LARGE_OUTPUT && item.value / item.calls > LARGE_EACH,
  );
  return finding('large_outputs', 'repository', found);
}

function checkVariants(records: ToolRecord[]): Finding | null {
  const groups = group(
    records,
    (record) => (isCheck(record) ? record.target : null),
    (record) => record.calls,
  );
  const found = items(groups, (entry) => entry.forms.size).filter(
    (item) => item.value > MANY_FORMS,
  );
  return finding('check_variants', 'repository', found);
}

function repeatedReads(records: ToolRecord[]): Finding | null {
  const groups = group(
    records,
    (record) => (record.tool === 'Read' && !UNION_FILE.test(record.target) ? record.target : null),
    (record) => record.calls,
  );
  const found = [...groups]
    .filter(([, entry]) => entry.byTicket.size >= READ_TICKETS)
    .map(([label, entry]) => ({
      label,
      value: entry.calls,
      calls: entry.byTicket.size,
      tickets: topTickets(entry.byTicket),
    }));
  return finding('repeated_reads', 'repository', found);
}

function denied(records: ToolRecord[]): Finding | null {
  const groups = group(
    records,
    (record) => (record.denied > 0 ? `${record.tool} ${record.target}`.trim() : null),
    (record) => record.denied,
  );
  const found = items(groups, (entry) => entry.value);
  const total = found.reduce((sum, item) => sum + item.value, 0);
  return total > MANY_DENIED ? finding('denied', 'repository', found) : null;
}

function repeatedSkills(records: ToolRecord[]): Finding | null {
  const groups = group(
    records,
    (record) => (record.tool === 'Skill' ? record.target : null),
    (record) => record.calls,
  );
  const found = items(groups, (entry) => entry.value).filter((item) => item.value > MANY_SKILLS);
  return finding('repeated_skills', 'repository', found);
}

/** The findings from the tool uses. */
export function toolFindings(records: ToolRecord[]): Finding[] {
  return [
    largeOutputs(records),
    checkVariants(records),
    repeatedReads(records),
    denied(records),
    repeatedSkills(records),
  ].filter((found) => found !== null);
}
