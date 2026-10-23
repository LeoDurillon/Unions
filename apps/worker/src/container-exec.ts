// Runs a command in the container and collects its output (for short commands, not agents).
import type { ContainerRuntime, ExecOptions } from '@union/core';

export type ExecOutput = { exitCode: number; stdout: string; stderr: string };

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
    throw new Error(`\`${command.join(' ')}\` failed (exit ${result.exitCode}): ${detail}`);
  }
  return result.stdout;
}
