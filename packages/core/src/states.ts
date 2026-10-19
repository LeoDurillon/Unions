// Ticket state machine. Pure: the worker persists the result, nothing here does I/O.

export const PLANNING_STEPS = ['intake', 'summary', 'technical', 'test_plan'] as const;
export type PlanningStep = (typeof PLANNING_STEPS)[number];
/**
 * `rebase` and `simplify` are outside the pipeline, run on demand once the branch exists: after a
 * rebase the agent worked on, the review runs again; a clean rebase (no agent) or a simplified
 * history leaves the reviewed code as it was, so the ticket goes back to where it was.
 */
export type Step = PipelineStep | 'rebase' | 'simplify';
/** A custom agent's step: `agent_<id>` of its `custom_agents` row; it runs like a planning step. */
export type CustomStep = `agent_${number}`;
export type PipelineStep = PlanningStep | CustomStep | 'implement' | 'final_review';
/** The steps Union ships with: every step but the custom agents'. */
export type BuiltInStep = Exclude<Step, CustomStep>;
/** The pipeline steps a ticket runs, in their order (`flows.ts` checks and resolves it). */
export type Flow = readonly PipelineStep[];

/** Models an agent can run on: the aliases `claude --model` accepts. */
export const AGENT_MODELS = ['haiku', 'sonnet', 'opus'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

const CUSTOM_STEP = /^agent_[1-9]\d*$/u;

export function isCustomStep(value: unknown): value is CustomStep {
  return typeof value === 'string' && CUSTOM_STEP.test(value);
}

export function customStep(id: number): CustomStep {
  return `agent_${id}`;
}

/** The `custom_agents` row id of a custom step. */
export function customAgentId(step: CustomStep): number {
  return Number(step.slice('agent_'.length));
}

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
} as const satisfies Record<BuiltInStep, AgentModel>;

/** Board column, mirrored to the GitHub Project `Status` field. */
export const BOARD_STATUSES = ['backlog', 'in_progress', 'in_review', 'done'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

/** What a run does with the changes a hook refused to commit, once the user decided. */
export type LeftoverResolution = 'commit' | 'discard';

export type Phase =
  | { kind: 'backlog' }
  // an agent run is in flight; `thenRun` chains a step without stopping for approval; `resume`
  // finishes a run paused on a refused commit, without the agent
  // `thenDone`: a simplification or clean rebase asked once done goes back to done
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
  // The host rebased the branch with no conflict and the checks passed: no agent changed code.
  | { type: 'rebased_clean' }
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

/** Each built-in step's name as the UI and the notifications show it (`stepTitle` for any step). */
export const STEP_TITLES: Record<BuiltInStep, string> = {
  intake: 'Intake',
  summary: 'Summary',
  technical: 'Technical',
  test_plan: 'Test plan',
  implement: 'Implementation',
  final_review: 'Final review',
  rebase: 'Rebase',
  simplify: 'Simplify history',
};

/** A pipeline step Union ships with. */
export type BuiltInPipelineStep = Exclude<PipelineStep, CustomStep>;
/** Every built-in pipeline step, in order (`rebase` and `simplify` are not). */
export const STEPS: readonly BuiltInPipelineStep[] = [
  ...PLANNING_STEPS,
  'implement',
  'final_review',
];
/** Every built-in step: the flow of a ticket that chose none before this was built. */
export const FULL_FLOW: readonly BuiltInPipelineStep[] = [
  ...PLANNING_STEPS,
  'implement',
  'final_review',
];

const PIPELINE_ORDER: readonly Step[] = STEPS;

/** Where `step` sits among the built-in pipeline steps; -1 for the others (custom, rebase, simplify). */
export function pipelineIndex(step: Step): number {
  return PIPELINE_ORDER.indexOf(step);
}

/** A run of `step`; a rebase always chains into a new final review, since the code changed. */
function running(step: Step): Phase {
  return step === 'rebase'
    ? { kind: 'running', step, thenRun: 'final_review' }
    : { kind: 'running', step };
}

/**
 * The step after `step` in the flow's own order; null at its end. A step outside the flow (an older
 * ticket's) goes on with the flow's first built-in step after it in pipeline order.
 */
export function nextStep(step: Step, flow: Flow = FULL_FLOW): Step | null {
  const steps: readonly Step[] = flow;
  const at = steps.indexOf(step);
  if (at !== -1) {
    return flow[at + 1] ?? null;
  }
  const order = pipelineIndex(step);
  return flow.find((later) => pipelineIndex(later) > order) ?? null;
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

// Every valid flow has `implement`: the fallback only covers an empty one.
function fromBacklog(action: Action, flow: Flow): Phase | null {
  return action.type === 'start' ? { kind: 'running', step: flow[0] ?? 'implement' } : null;
}

/** No agent changed the code, so the final review still stands: back to it, or to done. */
function backToReview(phase: { thenDone?: true }): Phase {
  return phase.thenDone ? { kind: 'done' } : { kind: 'awaiting_approval', step: 'final_review' };
}

function thenDoneOf(phase: { thenDone?: true }): { thenDone?: true } {
  return phase.thenDone ? { thenDone: true } : {};
}

function fromRunning(phase: PhaseOf<'running'>, action: Action): Phase | null {
  if (action.type === 'run_finished') {
    if (phase.step === 'simplify') {
      return backToReview(phase);
    }
    return phase.thenRun
      ? { kind: 'running', step: phase.thenRun }
      : { kind: 'awaiting_approval', step: phase.step };
  }
  if (action.type === 'rebased_clean' && phase.step === 'rebase') {
    return backToReview(phase);
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

function fromAwaitingApproval(
  phase: PhaseOf<'awaiting_approval'>,
  action: Action,
  flow: Flow,
): Phase | null {
  if (action.type === 'revise') {
    // Changes asked at the final review are made by the implementer, then the review runs again.
    return phase.step === 'final_review'
      ? { kind: 'running', step: 'implement', thenRun: 'final_review' }
      : { kind: 'running', step: phase.step };
  }
  if (action.type === 'approve') {
    const next = nextStep(phase.step, flow);
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
 * Done keeps its branch and pull request: a rebase the agent worked on, or changes asked in a review
 * afterwards, send it back through the final review. A clean rebase or a simplified history comes
 * back to done.
 */
function fromDone(action: Action): Phase | null {
  if (action.type === 'rebase') {
    return { kind: 'running', step: 'rebase', thenRun: 'final_review', thenDone: true };
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

function applyAction(phase: Phase, action: Action, flow: Flow): Phase | null {
  switch (phase.kind) {
    case 'backlog': {
      return fromBacklog(action, flow);
    }
    case 'running': {
      return fromRunning(phase, action);
    }
    case 'awaiting_approval': {
      return fromAwaitingApproval(phase, action, flow);
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

/** `flow` decides where `start` and `approve` lead; the other actions never leave it. */
export function transition(phase: Phase, action: Action, flow: Flow = FULL_FLOW): Phase {
  const terminal = phase.kind === 'done' || phase.kind === 'cancelled';
  if (action.type === 'cancel' && !terminal) {
    return { kind: 'cancelled' };
  }
  const next = applyAction(phase, action, flow);
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
