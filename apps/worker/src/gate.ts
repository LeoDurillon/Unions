import type { ContainerRuntime } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';

const GATE_TIMEOUT_MINUTES = 15;
const MS_PER_MINUTE = 60_000;
export const GATE_TIMEOUT_MS = GATE_TIMEOUT_MINUTES * MS_PER_MINUTE;
const TAIL_LINES = 120;
const INSTALL_ERROR_LINES = 40;

export type GateResult = { green: boolean; exitCode: number; tail: string };

export function tail(text: string, lines = TAIL_LINES): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

/** Runs the project's check command in the repository; a timeout counts as red. */
export async function runGate(
  runtime: ContainerRuntime,
  container: string,
  command: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  const timeout = AbortSignal.timeout(GATE_TIMEOUT_MS);
  const result = await runIn(runtime, container, ['sh', '-lc', `${command} 2>&1`], {
    cwd: REPO_DIR,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  return { green: result.exitCode === 0, exitCode: result.exitCode, tail: tail(result.stdout) };
}

/** Runs the project's install command; returns an error message, or null when it succeeded. */
export async function runInstall(
  runtime: ContainerRuntime,
  container: string,
  command: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    await mustRunIn(runtime, container, ['sh', '-lc', `${command} 2>&1`], {
      cwd: REPO_DIR,
      signal,
    });
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Install command \`${command}\` failed: ${tail(detail, INSTALL_ERROR_LINES)}`;
  }
}
