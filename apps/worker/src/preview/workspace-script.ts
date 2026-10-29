// A shell script run as root in a helper holding only the owner's workspace volume (at `/workspace`):
// what the services wrote there may be root's.
import type { ContainerRuntime } from '@union/core';

/** `args` are the script's `$1`…; `output` every line it printed, stderr included. */
export async function workspaceScript(
  runtime: ContainerRuntime,
  run: { image: string; volume: string; script: string; args?: string[] },
): Promise<{ exitCode: number; output: string[] }> {
  const lines = runtime.runHelper({
    image: run.image,
    command: ['sh', '-c', run.script, 'sh', ...(run.args ?? [])],
    mounts: [{ source: run.volume, target: '/workspace' }],
  });
  const output: string[] = [];
  for (;;) {
    const next = await lines.next();
    if (next.done) {
      return { exitCode: next.value.exitCode, output };
    }
    output.push(next.value);
  }
}
