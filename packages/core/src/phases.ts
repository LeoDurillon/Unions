// The ticket state machine's vocabulary: its steps, phases and actions, and small phase helpers.

export const PLANNING_STEPS = ['intake', 'summary', 'technical', 'test_plan'] as const;
export type PlanningStep = (typeof PLANNING_STEPS)[number];
/**
 * `rebase`, `retarget` (a rebase onto another base) and `simplify` are outside the pipeline, run on
 * demand once the branch exists: after a rebase the agent worked on, the review runs again; a clean rebase (no agent) or a simplified
 * history leaves the reviewed code as it was, so the ticket goes back to where it was.
 */
export type Step = PipelineStep | 'rebase' | 'retarget' | 'simplify' | StackStep;
/**
 * Splitting the pull request into a stack (`stack-states.ts`): planning the slices, rewriting the
 * history into them, and restacking them after a merge or a revision. Outside the pipeline too.
 */
type StackStep = 'split_plan' | 'split' | 'restack';
/** A custom agent's step: `agent_<id>` of its `custom_agents` row; it runs like a planning step. */
export type CustomStep = `agent_${number}`;
export type PipelineStep = PlanningStep | CustomStep | 'implement' | 'final_review';
/** The steps Union ships with: every step but the custom agents'. */
export type BuiltInStep = Exclude<Step, CustomStep>;
/** The pipeline steps a ticket runs, in their order (`flows.ts` checks and resolves it). */
export type Flow = readonly PipelineStep[];

/** What a run does with the changes a hook refused to commit, once the user decided. */
export type LeftoverResolution = 'commit' | 'discard';

export type Phase =
  | { kind: 'backlog' }
  // an agent run is in flight; `thenRun` chains a step without stopping for approval; `resume`
  // finishes a run paused on a refused commit, without the agent
  // `thenDone`: a simplification or clean rebase asked once done goes back to done
  // `hostOnly`: a restack started on its own after a merge, which never calls an agent
  | {
      kind: 'running';
      step: Step;
      thenRun?: Step;
      resume?: LeftoverResolution;
      thenDone?: true;
      hostOnly?: true;
    }
  // output written, waiting for the user; `thenDone`: a split plan asked once done
  | { kind: 'awaiting_approval'; step: Step; thenDone?: true }
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
  // Moves the branch's own commits onto another base (`tickets.retarget_branch`), then its PR.
  | { type: 'retarget' }
  // Rewrites the branch's commits into a simpler history, the code unchanged.
  | { type: 'simplify' }
  // Plans slices for a stack of pull requests, then rewrites the history into them once approved.
  | { type: 'split' }
  // Leaves the split plan waiting for approval; the ticket goes back to where the split was asked.
  | { type: 'drop_split' }
  // Moves the stack's slices onto the base again, after a slice merged.
  // `hostOnly`: started by the worker after a merge; git alone, a conflict waits for the user.
  | { type: 'restack'; hostOnly?: true }
  | { type: 'cancel' }
  // A hook refused the leftover commit: the run stops until the user decides.
  | { type: 'commit_refused' }
  // Commit the refused changes without the hooks, or set them aside, then finish the run.
  | { type: 'commit_anyway' }
  | { type: 'drop_leftovers' };

/**
 * A run of `step`; a rebase or a restack chains into a new final review when an agent changed code
 * (a clean one, `rebased_clean`, does not).
 */
export function running(step: Step): Phase {
  return step === 'rebase' || step === 'retarget' || step === 'restack'
    ? { kind: 'running', step, thenRun: 'final_review' }
    : { kind: 'running', step };
}

/** No agent changed the code, so the final review still stands: back to it, or to done. */
export function backToReview(phase: { thenDone?: true }): Phase {
  return phase.thenDone ? { kind: 'done' } : { kind: 'awaiting_approval', step: 'final_review' };
}

export function thenDoneOf(phase: { thenDone?: true }): { thenDone?: true } {
  return phase.thenDone ? { thenDone: true } : {};
}

export function thenRunOf(phase: { thenRun?: Step }): { thenRun?: Step } {
  return phase.thenRun ? { thenRun: phase.thenRun } : {};
}
