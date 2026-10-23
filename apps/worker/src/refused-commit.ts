// Records the refusal and stops the run there: the user decides what to do with the changes.
import {
  latestRefusal,
  markRefusalResolved,
  schema,
  type Db,
  type RefusedCommit,
  type ResumeState,
} from '@union/core';

import type { AgentOutcome } from './agent';
import { applyDecision, type Refused } from './leftovers';
import type { StepResult } from './scheduler';

type Ok = Extract<AgentOutcome, { kind: 'ok' }>;

export type Pause = {
  ticketId: number;
  step: 'implement' | 'rebase' | 'retarget' | 'simplify';
  refused: Refused;
  /** The agent's report. */
  report: string;
  sessionId: string | null;
  resumeState: ResumeState;
  /** Kept when the user already edited it; else the agent's. */
  message?: string;
};

function pausedOutput(report: string, files: string[]): string {
  const list = files.map((file) => `\`${file}\``).join(', ');
  return `${report.trim()}\n\n---\n\n**Commit refused by a hook:** ${files.length === 1 ? 'one file is' : `${files.length} files are`} not committed (${list}). Decide what to do with ${files.length === 1 ? 'it' : 'them'} below.`;
}

/** Records the refusal and stops the run there: the user decides what to do with the changes. */
export function pauseOnRefusal(db: Db, pause: Pause): StepResult {
  const { leftovers, hookOutput } = pause.refused;
  db.insert(schema.refusedCommits)
    .values({
      ticketId: pause.ticketId,
      step: pause.step,
      files: leftovers.files,
      hookOutput,
      diff: leftovers.diff,
      diffHash: leftovers.diffHash,
      message: pause.message ?? pause.refused.message,
      report: pause.report,
      sessionId: pause.sessionId,
      resumeState: pause.resumeState,
    })
    .run();
  return {
    kind: 'commit_refused',
    output: pausedOutput(pause.report, leftovers.files),
    ...(pause.sessionId ? { sessionId: pause.sessionId } : {}),
  };
}

/** The refusal a resumed run must apply: decided on, for this step, not applied yet. */
export function pendingRefusal(db: Db, ticketId: number, step: Pause['step']): RefusedCommit {
  const refusal = latestRefusal(db, ticketId);
  if (refusal?.step !== step || refusal.resolvedAt !== null || !refusal.resolution) {
    throw new Error('No decision on a refused commit is waiting to be applied');
  }
  return refusal;
}

/** The agent's answer as the paused run left it, so the run finishes as if it had just ended. */
export function outcomeOf(refusal: RefusedCommit): Ok {
  return { kind: 'ok', text: refusal.report, sessionId: refusal.sessionId ?? '' };
}

export function resolutionNote(refusal: RefusedCommit): string {
  return refusal.resolution === 'commit'
    ? `**Refused commit:** committed without the hooks as \`${refusal.message}\`, with your approval.`
    : '**Refused commit:** the changes were left out of the branch (kept in a stash in the workspace).';
}

/**
 * Applies the user's decision in the container. Changes that differ from the ones decided on pause
 * the run again; null means it was applied and the run can go on.
 */
export async function resumeRefusal(
  deps: { db: Db; runtime: Parameters<typeof applyDecision>[0] },
  container: string,
  refusal: RefusedCommit,
): Promise<StepResult | null> {
  const decision = await applyDecision(deps.runtime, container, {
    resolution: refusal.resolution === 'commit' ? 'commit' : 'discard',
    message: refusal.message,
    diffHash: refusal.diffHash,
  });
  markRefusalResolved(deps.db, refusal.id);
  if (decision.kind === 'applied' || !decision.leftovers) {
    return null;
  }
  return pauseOnRefusal(deps.db, {
    ticketId: refusal.ticketId,
    step: refusal.step,
    refused: {
      kind: 'refused',
      hookOutput: `The changes are not the ones you decided on: they changed since. Check them again.\n\n${refusal.hookOutput}`,
      leftovers: decision.leftovers,
      message: refusal.message,
    },
    report: refusal.report,
    sessionId: refusal.sessionId,
    resumeState: refusal.resumeState,
    message: refusal.message,
  });
}
