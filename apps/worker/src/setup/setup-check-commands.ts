// Runs a setup proposal's install command, then its check command, each with its own timeout, as the card's stages.

import {
  setSetupCheckStage,
  type ContainerRuntime,
  type Db,
  type SetupCheckOutcome,
} from '@union/core';

import { killedNote, runIn } from '../container-exec';
import { GATE_TIMEOUT_MS, tail } from '../gate';
import { REPO_DIR } from '../provision';

const INSTALL_TIMEOUT_MINUTES = 20;
const MS_PER_MINUTE = 60_000;
/** A large repository's install can take minutes: it gets its own time, not the check command's. */
const INSTALL_TIMEOUT_MS = INSTALL_TIMEOUT_MINUTES * MS_PER_MINUTE;

export type CommandsDeps = { db: Db; runtime: ContainerRuntime };

/** Which check of which container, and the commands to run there. */
export type CommandsRun = {
  checkId: number;
  container: string;
  installCommand: string;
  gateCommand: string;
};

type Step = { label: string; command: string; timeoutMs: number };

type StepResult = { exitCode: number; output: string; timedOut: boolean };

async function runStep(
  deps: CommandsDeps,
  container: string,
  step: Step,
  signal: AbortSignal,
): Promise<StepResult> {
  const timeout = AbortSignal.timeout(step.timeoutMs);
  const result = await runIn(deps.runtime, container, ['sh', '-lc', `${step.command} 2>&1`], {
    cwd: REPO_DIR,
    signal: AbortSignal.any([signal, timeout]),
  });
  const output = `${tail(result.stdout)}${killedNote(result.exitCode)}`.trim();
  return { exitCode: result.exitCode, output, timedOut: timeout.aborted && !signal.aborted };
}

/** Null when the step passed; else how the check ends, with the step's output. */
function failure(step: Step, result: StepResult): SetupCheckOutcome | null {
  if (result.timedOut) {
    const minutes = step.timeoutMs / MS_PER_MINUTE;
    const note = `The ${step.label} ran out of time after ${minutes} minutes.`;
    return { status: 'timed_out', output: `${result.output}\n\n${note}`.trim() };
  }
  if (result.exitCode !== 0) {
    const note = `The ${step.label} failed (exit ${result.exitCode}).`;
    return { status: 'failed', output: `${result.output}\n\n${note}`.trim() };
  }
  return null;
}

/** Runs one step, at its stage; an empty command is skipped and passes. */
async function runStage(
  deps: CommandsDeps,
  run: CommandsRun,
  step: Step & { stage: 'installing' | 'checking' },
  signal: AbortSignal,
): Promise<{ failed: SetupCheckOutcome | null; output: string }> {
  if (step.command.trim() === '') {
    return { failed: null, output: '' };
  }
  setSetupCheckStage(deps.db, run.checkId, step.stage);
  const result = await runStep(deps, run.container, step, signal);
  return { failed: failure(step, result), output: result.output };
}

/**
 * The install command, then the check command on what it left, in the clone; an empty one is
 * skipped. The stage says which one runs, and where it stopped once it ends.
 */
export async function runSetupCommands(
  deps: CommandsDeps,
  run: CommandsRun,
  signal: AbortSignal,
): Promise<SetupCheckOutcome> {
  const installed = await runStage(
    deps,
    run,
    {
      stage: 'installing',
      label: 'install command',
      command: run.installCommand,
      timeoutMs: INSTALL_TIMEOUT_MS,
    },
    signal,
  );
  if (installed.failed) {
    return installed.failed;
  }
  const checked = await runStage(
    deps,
    run,
    {
      stage: 'checking',
      label: 'check command',
      command: run.gateCommand,
      timeoutMs: GATE_TIMEOUT_MS,
    },
    signal,
  );
  return checked.failed ?? { status: 'passed', output: checked.output || installed.output };
}
