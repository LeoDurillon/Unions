// What a project's agent usage says to improve: large sessions, costly tickets, many review rounds.
// Read from its calls' tokens (browser-safe types).

/** Who can act on a finding: the project's repository (its docs, scripts, skills) or Union's own runs. */
export type FindingActor = 'repository' | 'union';

export type FindingKind =
  | 'large_sessions'
  | 'costly_tickets'
  | 'review_rounds'
  | 'large_outputs'
  | 'check_variants'
  | 'repeated_reads'
  | 'denied'
  | 'repeated_skills'
  | 'over_estimate';

/**
 * One thing a finding names: a step, a ticket, a command, a file or a skill. `value` is the figure
 * the kind measures (a context in tokens, a cost in micro-dollars, bytes, forms, reads, refusals);
 * `tickets` the tickets that show it most.
 */
export type FindingItem = { label: string; value: number; calls: number; tickets: number[] };

export type Finding = { kind: FindingKind; actor: FindingActor; items: FindingItem[] };

/** One agent call's main-model row, as the findings read it. */
export type CallRecord = {
  ticketId: number | null;
  step: string | null;
  peakContext: number | null;
  costMicroUsd: number;
};

/** A step whose calls average more context than this is a large session. */
const LARGE_SESSION = 150_000;
/** A ticket costing this many times the median ticket is costly. */
const COSTLY_FACTOR = 3;
/** Under this many tickets, a median says little. */
const MIN_TICKETS = 5;
/** A ticket reviewed more times than this. */
const MANY_REVIEWS = 3;
/** The most items a finding lists. */
const MAX_ITEMS = 10;
/** The tickets an item links to. */
const TOP_TICKETS = 3;

/** The tickets with the highest value, highest first. */
export function topTickets(values: Map<number, number>): number[] {
  return [...values]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, TOP_TICKETS)
    .map(([id]) => id);
}

/** The finding, with its items highest first, or null when none. */
export function finding(
  kind: FindingKind,
  actor: FindingActor,
  items: FindingItem[],
): Finding | null {
  if (items.length === 0) {
    return null;
  }
  return { kind, actor, items: items.toSorted((a, b) => b.value - a.value).slice(0, MAX_ITEMS) };
}

type StepPeaks = { sum: number; calls: number; peaks: Map<number, number> };

type SizedCall = CallRecord & { step: string; peakContext: number };

function isSized(call: CallRecord): call is SizedCall {
  return call.step !== null && call.peakContext !== null;
}

function addPeak(steps: Map<string, StepPeaks>, call: SizedCall): void {
  const step: StepPeaks = steps.get(call.step) ?? { sum: 0, calls: 0, peaks: new Map() };
  step.sum += call.peakContext;
  step.calls += 1;
  if (call.ticketId !== null) {
    step.peaks.set(call.ticketId, Math.max(step.peaks.get(call.ticketId) ?? 0, call.peakContext));
  }
  steps.set(call.step, step);
}

function largeSessions(calls: CallRecord[]): Finding | null {
  const steps = new Map<string, StepPeaks>();
  for (const call of calls.filter((record) => isSized(record))) {
    addPeak(steps, call);
  }
  const items = [...steps].map(([label, step]) => ({
    label,
    value: Math.round(step.sum / step.calls),
    calls: step.calls,
    tickets: topTickets(step.peaks),
  }));
  return finding(
    'large_sessions',
    'union',
    items.filter((item) => item.value > LARGE_SESSION),
  );
}

type TicketTotals = { cost: number; implement: number; reviews: number };

function ticketTotals(calls: CallRecord[]): Map<number, TicketTotals> {
  const tickets = new Map<number, TicketTotals>();
  for (const call of calls) {
    const id = call.ticketId;
    if (id !== null) {
      const ticket = tickets.get(id) ?? { cost: 0, implement: 0, reviews: 0 };
      ticket.cost += call.costMicroUsd;
      ticket.implement += call.step === 'implement' ? 1 : 0;
      ticket.reviews += call.step === 'final_review' ? 1 : 0;
      tickets.set(id, ticket);
    }
  }
  return tickets;
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function costlyTickets(tickets: Map<number, TicketTotals>): Finding | null {
  if (tickets.size < MIN_TICKETS) {
    return null;
  }
  const bar = median([...tickets.values()].map((ticket) => ticket.cost)) * COSTLY_FACTOR;
  const items = [...tickets]
    .filter(([, ticket]) => ticket.cost > bar)
    .map(([id, ticket]) => ({
      label: '',
      value: ticket.cost,
      calls: ticket.implement,
      tickets: [id],
    }));
  return finding('costly_tickets', 'union', items);
}

function reviewRounds(tickets: Map<number, TicketTotals>): Finding | null {
  const items = [...tickets]
    .filter(([, ticket]) => ticket.reviews > MANY_REVIEWS)
    .map(([id, ticket]) => ({
      label: '',
      value: ticket.reviews,
      calls: ticket.reviews,
      tickets: [id],
    }));
  return finding('review_rounds', 'union', items);
}

/** The findings from the calls' tokens: large sessions, costly tickets and many review rounds. */
export function callFindings(calls: CallRecord[]): Finding[] {
  const tickets = ticketTotals(calls);
  return [largeSessions(calls), costlyTickets(tickets), reviewRounds(tickets)].filter(
    (found) => found !== null,
  );
}
