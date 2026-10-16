// Ticket state machine. Pure: the worker persists the result, nothing here does I/O.

export const PLANNING_STEPS = ['intake', 'summary', 'technical', 'test_plan'] as const;
export type PlanningStep = (typeof PLANNING_STEPS)[number];
/**
 * `rebase` and `simplify` are outside the pipeline, run on demand once the branch exists: after a
 * rebase the review runs again; a simplified history keeps the same code, so the ticket goes back
 * to where it was.
 */
export type Step = PlanningStep | 'implement' | 'final_review' | 'rebase' | 'simplify';

/** Models an agent can run on: the aliases `claude --model` accepts. */
export const AGENT_MODELS = ['haiku', 'sonnet', 'opus'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

export function isAgentModel(value: unknown): value is AgentModel {
  return AGENT_MODELS.some((model) => model === value);
}

/** Thinking effort levels `claude --effort` accepts; an agent without one runs at the CLI's default. */
export const AGENT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AgentEffort = (typeof AGENT_EFFORTS)[number];

export function isAgentEffort(value: unknown): value is AgentEffort {
  return AGENT_EFFORTS.some((effort) => effort === value);
}

export const MODEL_BY_STEP = {
  intake: 'haiku',
  summary: 'sonnet',
  technical: 'opus',
  test_plan: 'sonnet',
  implement: 'opus',
  final_review: 'opus',
  // Only fallbacks: these resume the implementer's session, on its model (`modelFor`).
  rebase: 'opus',
  simplify: 'opus',
} as const satisfies Record<Step, AgentModel>;

/** Board column, mirrored to the GitHub Project `Status` field. */
export const BOARD_STATUSES = ['backlog', 'in_progress', 'in_review', 'done'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

/** What a run does with the changes a hook refused to commit, once the user decided. */
export type LeftoverResolution = 'commit' | 'discard';

export type Phase =
  | { kind: 'backlog' }
  // an agent run is in flight; `thenRun` chains a step without stopping for approval; `resume`
  // finishes a run paused on a refused commit, without the agent
  // `thenDone`: a history simplification asked once done goes back to done
  | { kind: 'running'; step: Step; thenRun?: Step; resume?: LeftoverResolution; thenDone?: true }
  | { kind: 'awaiting_approval'; step: Step } // output written, waiting for the user
  // the repository's hook refused the changes the agent left uncommitted; the user decides
  | { kind: 'commit_refused'; step: Step; thenRun?: Step; thenDone?: true }
  | { kind: 'rate_limited'; step: Step; retryAt: number | null; thenDone?: true }
  | { kind: 'failed'; step: Step; error: string; thenDone?: true }
  | { kind: 'done' }
  | { kind: 'cancelled' };

export type Action =
  | { type: 'start' } // moved to In Progress
  | { type: 'run_finished' }
  | { type: 'run_failed'; error: string }
  | { type: 'rate_limited'; retryAt: number | null }
  | { type: 'approve' }
  | { type: 'revise' } // feedback is stored separately, then the same step re-runs
  | { type: 'retry' }
  // Brings the branch up to date with its base; the caller checks the pull request is still open.
  | { type: 'rebase' }
  // Rewrites the branch's commits into a simpler history, the code unchanged.
  | { type: 'simplify' }
  | { type: 'cancel' }
  // A hook refused the leftover commit: the run stops until the user decides.
  | { type: 'commit_refused' }
  // Commit the refused changes without the hooks, or set them aside, then finish the run.
  | { type: 'commit_anyway' }
  | { type: 'drop_leftovers' };

/** Each step's name as the UI and the notifications show it. */
export const STEP_TITLES: Record<Step, string> = {
  intake: 'Intake',
  summary: 'Summary',
  technical: 'Technical',
  test_plan: 'Test plan',
  implement: 'Implementation',
  final_review: 'Final review',
  rebase: 'Rebase',
  simplify: 'Simplify history',
};

/** Every pipeline step, in order (`rebase` and `simplify` are not). */
export const STEPS: readonly Step[] = [...PLANNING_STEPS, 'implement', 'final_review'];
const ORDER = STEPS;

/** A run of `step`; a rebase always chains into a new final review, since the code changed. */
function running(step: Step): Phase {
  return step === 'rebase'
    ? { kind: 'running', step, thenRun: 'final_review' }
    : { kind: 'running', step };
}

export function nextStep(step: Step): Step | null {
  return ORDER[ORDER.indexOf(step) + 1] ?? null;
}

export class InvalidTransition extends Error {
  constructor(phase: Phase, action: Action) {
    super(`Invalid transition: ${action.type} from ${phase.kind}`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

type PhaseOf<K extends Phase['kind']> = Extract<Phase, { kind: K }>;

function fromBacklog(action: Action): Phase | null {
  return action.type === 'start' ? { kind: 'running', step: 'intake' } : null;
}

/** The code did not change, so the final review still stands: back to it, or to done. */
function afterSimplify(phase: { thenDone?: true }): Phase {
  return phase.thenDone ? { kind: 'done' } : { kind: 'awaiting_approval', step: 'final_review' };
}

function thenDoneOf(phase: { thenDone?: true }): { thenDone?: true } {
  return phase.thenDone ? { thenDone: true } : {};
}

function fromRunning(phase: PhaseOf<'running'>, action: Action): Phase | null {
  if (action.type === 'run_finished') {
    if (phase.step === 'simplify') {
      return afterSimplify(phase);
    }
    return phase.thenRun
      ? { kind: 'running', step: phase.thenRun }
      : { kind: 'awaiting_approval', step: phase.step };
  }
  if (action.type === 'run_failed') {
    return { kind: 'failed', step: phase.step, error: action.error, ...thenDoneOf(phase) };
  }
  if (action.type === 'rate_limited') {
    return {
      kind: 'rate_limited',
      step: phase.step,
      retryAt: action.retryAt,
      ...thenDoneOf(phase),
    };
  }
  if (action.type === 'commit_refused') {
    return { kind: 'commit_refused', step: phase.step, ...thenRunOf(phase), ...thenDoneOf(phase) };
  }
  return null;
}

function thenRunOf(phase: { thenRun?: Step }): { thenRun?: Step } {
  return phase.thenRun ? { thenRun: phase.thenRun } : {};
}

/** The implementer can also be sent back with guidance; a rebase cannot. */
function fromCommitRefused(phase: PhaseOf<'commit_refused'>, action: Action): Phase | null {
  if (action.type === 'commit_anyway' || action.type === 'drop_leftovers') {
    const resume = action.type === 'commit_anyway' ? 'commit' : 'discard';
    return { kind: 'running', step: phase.step, ...thenRunOf(phase), ...thenDoneOf(phase), resume };
  }
  if (action.type === 'revise' && phase.step === 'implement') {
    return { kind: 'running', step: 'implement', ...thenRunOf(phase) };
  }
  return null;
}

function fromAwaitingApproval(phase: PhaseOf<'awaiting_approval'>, action: Action): Phase | null {
  if (action.type === 'revise') {
    // Changes asked at the final review are made by the implementer, then the review runs again.
    return phase.step === 'final_review'
      ? { kind: 'running', step: 'implement', thenRun: 'final_review' }
      : { kind: 'running', step: phase.step };
  }
  if (action.type === 'approve') {
    const next = nextStep(phase.step);
    return next ? { kind: 'running', step: next } : { kind: 'done' };
  }
  if (action.type === 'rebase' && phase.step === 'final_review') {
    return running('rebase');
  }
  if (action.type === 'simplify' && phase.step === 'final_review') {
    return running('simplify');
  }
  return null;
}

/**
 * Done keeps its branch and pull request: a rebase, or changes asked in a review afterwards, send it
 * back through the implementer, then the final review. A simplified history comes back to done.
 */
function fromDone(action: Action): Phase | null {
  if (action.type === 'rebase') {
    return running('rebase');
  }
  if (action.type === 'simplify') {
    return { kind: 'running', step: 'simplify', thenDone: true };
  }
  return action.type === 'revise'
    ? { kind: 'running', step: 'implement', thenRun: 'final_review' }
    : null;
}

function fromStalled(phase: PhaseOf<'failed' | 'rate_limited'>, action: Action): Phase | null {
  if (action.type !== 'retry') {
    return null;
  }
  const next = running(phase.step);
  return next.kind === 'running' ? { ...next, ...thenDoneOf(phase) } : next;
}

function applyAction(phase: Phase, action: Action): Phase | null {
  switch (phase.kind) {
    case 'backlog': {
      return fromBacklog(action);
    }
    case 'running': {
      return fromRunning(phase, action);
    }
    case 'awaiting_approval': {
      return fromAwaitingApproval(phase, action);
    }
    case 'commit_refused': {
      return fromCommitRefused(phase, action);
    }
    case 'failed':
    case 'rate_limited': {
      return fromStalled(phase, action);
    }
    case 'done': {
      return fromDone(action);
    }
    case 'cancelled': {
      return null;
    }
    default: {
      return assertNever(phase);
    }
  }
}

export function transition(phase: Phase, action: Action): Phase {
  const terminal = phase.kind === 'done' || phase.kind === 'cancelled';
  if (action.type === 'cancel' && !terminal) {
    return { kind: 'cancelled' };
  }
  const next = applyAction(phase, action);
  if (!next) {
    throw new InvalidTransition(phase, action);
  }
  return next;
}

export function boardStatus(phase: Phase): BoardStatus {
  switch (phase.kind) {
    case 'backlog':
    case 'cancelled': {
      return 'backlog';
    }
    case 'done': {
      return 'done';
    }
    case 'running':
    case 'awaiting_approval':
    case 'commit_refused':
    case 'rate_limited':
    case 'failed': {
      return phase.step === 'final_review' || phase.step === 'rebase' || phase.step === 'simplify'
        ? 'in_review'
        : 'in_progress';
    }
    default: {
      return assertNever(phase);
    }
  }
}

/** The board's columns: the GitHub Project's, plus Merged / Closed, which only Union shows. */
export type BoardColumn = BoardStatus | 'merged';

/** How long a ticket stays in Merged / Closed after its pull request was merged or closed: 21 days. */
export const MERGED_VISIBLE_MS = 1_814_400_000;

type PrEnd = {
  prState: 'open' | 'closed' | 'merged' | null;
  prMergedAt: number | null;
  prClosedAt: number | null;
};

/**
 * A ticket whose pull request is merged or closed is in Merged / Closed, whatever its phase; else
 * its phase's column.
 */
export function boardColumn(ticket: { phase: Phase; prState: PrEnd['prState'] }): BoardColumn {
  return ticket.prState === 'merged' || ticket.prState === 'closed'
    ? 'merged'
    : boardStatus(ticket.phase);
}

/** Merged or closed three weeks ago or more: off the board. Until the date is known, it stays. */
export function leftBoard(ticket: PrEnd, now: number): boolean {
  const endedAt = ticket.prState === 'merged' ? ticket.prMergedAt : ticket.prClosedAt;
  return ticket.prState !== 'open' && endedAt !== null && now - endedAt >= MERGED_VISIBLE_MS;
}
