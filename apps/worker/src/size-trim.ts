// Measures an implementation against its size budget and, when a first one went too far over, sends the implementer's session back once to cut it.
import {
  changeBudget,
  describeSize,
  emitEvent,
  isOverBudget,
  measureChange,
  parseNumstat,
  resolveAgent,
  sizeIgnoreOf,
  type ChangeBudget,
  type ChangeSize,
  type Db,
  type ProjectConfig,
} from '@union/core';

import { approvedBefore } from './approved';
import { mustRunIn } from './container-exec';
import { implementLoop, type Loop } from './implement-loop';
import type { Implemented, Prepared } from './implement-run';
import { REPO_DIR } from './provision';
import { restoreBranch } from './rebase-git';
import type { StepResult } from './scheduler';
import { headCommit } from './workspace-git';

/** The files named to the implementer, largest first: enough to show where the lines went. */
const MAX_FILES = 15;

/** The change on the branch as the host counts it: lines of code added, tests and the rest apart. */
async function measureBranch(workspace: Prepared): Promise<ChangeSize> {
  const { deps, project, container, base } = workspace;
  const numstat = await mustRunIn(deps.runtime, container, [
    'git',
    '-C',
    REPO_DIR,
    'diff',
    '--numstat',
    '-z',
    '--no-renames',
    `${base}...HEAD`,
  ]);
  return measureChange(parseNumstat(numstat), sizeIgnoreOf(project.config));
}

/** The approved technical plan's estimate, else the project's default. */
function budgetOf(db: Db, ticketId: number, config: ProjectConfig): ChangeBudget | null {
  const technical = approvedBefore(db, ticketId, 'implement').find(
    (output) => output.step === 'technical',
  );
  return changeBudget(technical?.content ?? null, config);
}

function record(
  workspace: Prepared,
  measure: { size: ChangeSize; budget: ChangeBudget | null },
  phase: 'implemented' | 'trimmed',
): void {
  const { code, removed, tests, other } = measure.size;
  emitEvent(workspace.deps.db, {
    type: 'change_measured',
    ticketId: workspace.context.ticket.id,
    payload: { code, removed, tests, other, budget: measure.budget?.lines ?? null, phase },
  });
}

/** The figures, then the trim prompt the user can edit. */
function trimTurn(db: Db, size: ChangeSize, budget: ChangeBudget): string {
  const against =
    budget.source === 'estimate' ? 'estimated by the technical plan' : 'allowed by the project';
  const files = size.codeFiles
    .slice(0, MAX_FILES)
    .map((file) => `- \`${file.path}\`: +${file.additions}`)
    .join('\n');
  return `# The change is larger than planned\n\nIt adds ${size.code} lines of code (tests, lock files, migrations and docs left out) against ~${budget.lines} ${against}. Where they are:\n\n${files}\n\n${resolveAgent(db, 'trim').prompt}`;
}

/** A first implementation with green checks, too far over its budget. */
function needsTrim(workspace: Prepared, done: Implemented): boolean {
  const { revision, resume } = workspace.context;
  const green = done.loop.gate === null || done.loop.gate.green;
  return revision === null && resume === null && green;
}

/** Why the trim pass cannot be kept; null when it can. */
function trimFailure(loop: Loop): string | null {
  if (loop.outcome.kind === 'rate_limited') {
    return 'the usage limit was reached';
  }
  if (loop.outcome.kind === 'error') {
    return loop.outcome.message;
  }
  if (loop.refused) {
    return "the repository's hook refused the changes it left";
  }
  return loop.gate !== null && !loop.gate.green ? 'the checks failed after it' : null;
}

function withNote(done: Implemented, note: string): Implemented {
  return { ...done, note: done.note === undefined ? note : `${done.note}\n\n${note}` };
}

/** One trim turn and its checks; the branch goes back as it was when they fail. */
async function trim(
  workspace: Prepared,
  done: Implemented,
  measured: { size: ChangeSize; budget: ChangeBudget },
): Promise<StepResult | Implemented> {
  const { deps, context, container, branch } = workspace;
  const { size, budget } = measured;
  const before = await headCommit(deps.runtime, container);
  const loop = await implementLoop({
    ...workspace,
    turn: trimTurn(deps.db, size, budget),
    context: { ...context, resumeSessionId: done.loop.outcome.sessionId },
  });
  if (context.signal.aborted) {
    return { kind: 'error', error: 'Cancelled during the trim pass.' };
  }
  const failure = trimFailure(loop);
  if (failure !== null || loop.outcome.kind !== 'ok') {
    await restoreBranch(deps.runtime, container, branch, before);
    const why = failure ?? 'it did not finish';
    return withNote(
      done,
      `**Size:** ${describeSize(size, budget)}. The trim pass was dropped (${why}): the change is as the implementation left it.`,
    );
  }
  const trimmed = await measureBranch(workspace);
  record(workspace, { size: trimmed, budget }, 'trimmed');
  return withNote(
    {
      loop: {
        outcome: { ...loop.outcome, text: `${done.loop.outcome.text}\n\n${loop.outcome.text}` },
        gate: loop.gate,
        iterations: done.loop.iterations + loop.iterations,
      },
      ...(done.note === undefined ? {} : { note: done.note }),
    },
    `**Size:** ${describeSize(trimmed, budget)}; ${size.code} before the trim pass.`,
  );
}

/**
 * Measures the change and notes it in the report; a first implementation over its budget by more
 * than the tolerance gets one trim pass. A failed measure never fails the step.
 */
export async function sizeAndTrim(
  workspace: Prepared,
  done: Implemented,
): Promise<StepResult | Implemented> {
  const { deps, context, project } = workspace;
  const budget = budgetOf(deps.db, context.ticket.id, project.config);
  const size = await measureBranch(workspace).catch((error: unknown) => {
    context.log({ type: 'union_size_failed', error: String(error) });
    return null;
  });
  if (size === null) {
    return done;
  }
  record(workspace, { size, budget }, 'implemented');
  if (budget === null || !isOverBudget(size, budget) || !needsTrim(workspace, done)) {
    return withNote(done, `**Size:** ${describeSize(size, budget)}.`);
  }
  context.log({ type: 'union_note', text: `over its size budget: ${describeSize(size, budget)}` });
  return trim(workspace, done, { size, budget });
}
