// Runs a command in the container and collects its output (for short commands, not agents).
import type { ContainerRuntime, ExecOptions } from '@union/core';

export type ExecOutput = { exitCode: number; stdout: string; stderr: string };

/** The exit code of a process the kernel killed (SIGKILL): in a capped container, most often for its memory. */
const KILLED = 137;

/** What to add to a failure's message when its process was killed, so the cause is not a guess. */
export function killedNote(exitCode: number): string {
  return exitCode === KILLED
    ? ' Exit 137: the process was killed, most likely for using more memory than its container may (raise it in Union settings → Resources).'
    : '';
}

/** Runs a command in the container and collects its output (for short commands, not agents). */
export async function runIn(
  runtime: ContainerRuntime,
  container: string,
  command: string[],
  options: ExecOptions = {},
): Promise<ExecOutput> {
  const stream = runtime.exec(container, command, options);
  const lines: string[] = [];
  let next = await stream.next();
  while (!next.done) {
    lines.push(next.value);
    next = await stream.next();
  }
  return { exitCode: next.value.exitCode, stdout: lines.join('\n'), stderr: next.value.stderr };
}

/** Like `runIn`, but a non-zero exit throws with the command's stderr. */
export async function mustRunIn(
  runtime: ContainerRuntime,
  container: string,
  command: string[],
  options: ExecOptions = {},
): Promise<string> {
  const result = await runIn(runtime, container, command, options);
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `\`${command.join(' ')}\` failed (exit ${result.exitCode}): ${detail}${killedNote(result.exitCode)}`,
    );
  }
  return result.stdout;
}
