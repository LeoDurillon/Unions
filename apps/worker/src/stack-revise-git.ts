// The git side of restacking a revision: each slice's commits, the reordering rebase, and its result.
import type { ContainerRuntime, RestackSlice, TicketSlice } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { tail } from './gate';
import { REPO_DIR } from './provision';

const TODO = `${REPO_DIR}/.git/union-restack-todo`;
const DETAIL_LINES = 20;

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

async function lines(
  runtime: ContainerRuntime,
  container: string,
  args: string[],
): Promise<string[]> {
  const output = await mustRunIn(runtime, container, git(args));
  return output.split('\n').filter((line) => line.trim() !== '');
}

/** Where the bottom slice leaves its base. */
export async function stackFork(
  runtime: ContainerRuntime,
  container: string,
  input: { base: string; bottomTip: string },
): Promise<string> {
  const [fork = ''] = await lines(runtime, container, ['merge-base', input.bottomTip, input.base]);
  return fork;
}

/** Each slice's commits as recorded at the last push, oldest first. */
export async function sliceCommits(
  runtime: ContainerRuntime,
  container: string,
  input: { fork: string; slices: readonly TicketSlice[] },
): Promise<RestackSlice[]> {
  const stack: RestackSlice[] = [];
  let from = input.fork;
  for (const slice of input.slices) {
    const commits = await lines(runtime, container, [
      'rev-list',
      '--reverse',
      `${from}..${slice.tipSha}`,
    ]);
    stack.push({ position: slice.position, branch: slice.branch, commits });
    from = slice.tipSha;
  }
  return stack;
}

/** Each slice's commits with their subjects, for the implementer's prompt. */
export async function sliceLogs(
  runtime: ContainerRuntime,
  container: string,
  input: { fork: string; slices: readonly TicketSlice[] },
): Promise<string[][]> {
  const logs: string[][] = [];
  let from = input.fork;
  for (const slice of input.slices) {
    logs.push(
      await lines(runtime, container, [
        'log',
        '--reverse',
        '--format=%h %s',
        `${from}..${slice.tipSha}`,
      ]),
    );
    from = slice.tipSha;
  }
  return logs;
}

export async function treeOf(
  runtime: ContainerRuntime,
  container: string,
  ref: string,
): Promise<string> {
  const [tree = ''] = await lines(runtime, container, ['rev-parse', `${ref}^{tree}`]);
  return tree;
}

/**
 * Replays the stack with the host's todo (`git rebase -i` reading it as its editor); stopped, it is
 * aborted and says where.
 */
export async function replay(
  runtime: ContainerRuntime,
  container: string,
  input: { fork: string; todo: string },
): Promise<string | null> {
  await mustRunIn(runtime, container, [
    'sh',
    '-c',
    'printf "%s" "$1" > "$2"',
    'sh',
    input.todo,
    TODO,
  ]);
  const result = await runIn(
    runtime,
    container,
    git(['-c', 'core.editor=true', '-c', `sequence.editor=cp ${TODO}`, 'rebase', '-i', input.fork]),
  );
  if (result.exitCode === 0) {
    return null;
  }
  const conflicted = await runIn(
    runtime,
    container,
    git(['diff', '--name-only', '--diff-filter=U']),
  );
  await runIn(runtime, container, git(['rebase', '--abort']));
  const files = conflicted.stdout.split('\n').filter((line) => line.trim() !== '');
  const where = files.length > 0 ? ` in ${files.map((file) => `\`${file}\``).join(', ')}` : '';
  return `Moving the new commits into their slices stopped on a conflict${where}; the branch is as the implementer left it, unpushed.\n\n\`\`\`\n${tail(`${result.stdout}\n${result.stderr}`, DETAIL_LINES)}\n\`\`\``;
}
