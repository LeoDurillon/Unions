// Ticket state machine. Pure: the worker persists the result, nothing here does I/O.

export const PLANNING_STEPS = ['intake', 'summary', 'technical', 'test_plan'] as const;
export type PlanningStep = (typeof PLANNING_STEPS)[number];
/** `rebase` is outside the pipeline: run on demand once the branch exists, then the review runs again. */
export type Step = PlanningStep | 'implement' | 'final_review' | 'rebase';

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
  // Only a fallback: the rebase resumes the implementer's session, on its model (`modelFor`).
  rebase: 'opus',
} as const satisfies Record<Step, AgentModel>;

/** Board column, mirrored to the GitHub Project `Status` field. */
export const BOARD_STATUSES = ['backlog', 'in_progress', 'in_review', 'done'] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export type Phase =
  | { kind: 'backlog' }
  // an agent run is in flight; `thenRun` chains a step without stopping for approval
  | { kind: 'running'; step: Step; thenRun?: Step }
  | { kind: 'awaiting_approval'; step: Step } // output written, waiting for the user
  | { kind: 'rate_limited'; step: Step; retryAt: number | null }
  | { kind: 'failed'; step: Step; error: string }
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
  | { type: 'cancel' };

/** Every pipeline step, in order (`rebase` is not one). */
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

function fromRunning(phase: PhaseOf<'running'>, action: Action): Phase | null {
  if (action.type === 'run_finished') {
    return phase.thenRun
      ? { kind: 'running', step: phase.thenRun }
      : { kind: 'awaiting_approval', step: phase.step };
  }
  if (action.type === 'run_failed') {
    return { kind: 'failed', step: phase.step, error: action.error };
  }
  if (action.type === 'rate_limited') {
    return { kind: 'rate_limited', step: phase.step, retryAt: action.retryAt };
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
  return null;
}

function fromStalled(phase: PhaseOf<'failed' | 'rate_limited'>, action: Action): Phase | null {
  return action.type === 'retry' ? running(phase.step) : null;
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
    case 'failed':
    case 'rate_limited': {
      return fromStalled(phase, action);
    }
    case 'done': {
      // Done keeps an open pull request; a rebase sends it back to review.
      return action.type === 'rebase' ? running('rebase') : null;
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
    case 'rate_limited':
    case 'failed': {
      return phase.step === 'final_review' || phase.step === 'rebase' ? 'in_review' : 'in_progress';
    }
    default: {
      return assertNever(phase);
    }
  }
}
