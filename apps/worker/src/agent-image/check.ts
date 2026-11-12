// Checks that a project's agent image still has what Union's agents need. That is the claude CLI,
// git, the node user and its HOME, /workspace.
import type { ContainerRuntime } from '@union/core';

/** Each line it prints is a problem; it exits 1 when there is one. */
const CHECK_SCRIPT = [
  'problems=0',
  'problem() { echo "$1"; problems=1; }',
  'claude --version >/dev/null 2>&1 || problem "The claude CLI does not run (claude --version)"',
  'git --version >/dev/null 2>&1 || problem "git is not installed"',
  '[ "$(id -u)" = 1000 ] || problem "The image runs as user $(id -u), not 1000 (node): end the Dockerfile with USER node"',
  '[ "$HOME" = /home/node ] || problem "HOME is $HOME, not /home/node"',
  '{ touch "$HOME/.union-check" && rm "$HOME/.union-check"; } 2>/dev/null || problem "HOME ($HOME) is not writable by the image\'s user"',
  '[ -d /workspace ] || problem "/workspace does not exist"',
  'command -v sleep >/dev/null || problem "sleep is not installed"',
  'exit $problems',
].join('\n');

/** Null when the image is fit for the agents; otherwise what is wrong, one problem a line. */
export async function checkAgentImage(
  runtime: ContainerRuntime,
  image: string,
  signal: AbortSignal,
): Promise<string | null> {
  const lines: string[] = [];
  const checked = runtime.runHelper({ image, command: ['sh', '-c', CHECK_SCRIPT], signal });
  let next = await checked.next();
  while (!next.done) {
    lines.push(next.value);
    next = await checked.next();
  }
  if (next.value.exitCode === 0) {
    return null;
  }
  const said = lines.join('\n').trim();
  return said === '' ? `The image's check exited with ${next.value.exitCode}` : said;
}
