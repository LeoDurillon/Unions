// The git side of restacking a revision: each slice's commits, the reordering rebase, and its result.
import type { ContainerRuntime, RestackSlice, TicketSlice } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { tail } from './gate';
import { REPO_DIR } from './provision';

const TODO = `${REPO_DIR}/.git/union-restack-todo`;
const DETAIL_LINES = 20;
/** The conflicts one replay may hand to the implementer before it gives up. */
const MAX_CONFLICTS = 20;

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

export async function commitOf(
  runtime: ContainerRuntime,
  container: string,
  ref: string,
): Promise<string> {
  const [sha = ''] = await lines(runtime, container, ['rev-parse', `${ref}^{commit}`]);
  return sha;
}

export async function treeOf(
  runtime: ContainerRuntime,
  container: string,
  ref: string,
): Promise<string> {
  const [tree = ''] = await lines(runtime, container, ['rev-parse', `${ref}^{tree}`]);
  return tree;
}

/** Where the replay stopped: the commit being applied and the files left in conflict. */
export type Stop = { sha: string; subject: string; files: string[] };

/** Resolves a stop in the workspace, its files staged; false gives up. */
export type Resolve = (stop: Stop) => Promise<boolean>;

/** The replay done, with the conflicts resolved on the way, or why it was aborted. */
export type Replayed = { conflicts: number } | { error: string };

async function conflicted(runtime: ContainerRuntime, container: string): Promise<string[]> {
  const result = await runIn(runtime, container, git(['diff', '--name-only', '--diff-filter=U']));
  return result.stdout.split('\n').filter((line) => line.trim() !== '');
}

async function stoppedAt(runtime: ContainerRuntime, container: string): Promise<Stop> {
  const result = await runIn(
    runtime,
    container,
    git(['log', '-1', '--format=%H%n%s', 'REBASE_HEAD']),
  );
  const [sha = '', subject = ''] = result.stdout.split('\n');
  return { sha, subject, files: await conflicted(runtime, container) };
}

async function aborted(
  runtime: ContainerRuntime,
  container: string,
  input: { files: readonly string[]; output: string; why: string },
): Promise<string> {
  await runIn(runtime, container, git(['rebase', '--abort']));
  const { files } = input;
  const where = files.length > 0 ? ` in ${files.map((file) => `\`${file}\``).join(', ')}` : '';
  return `Moving the new commits into their slices stopped${where}: ${input.why}. The branch is as the implementer left it, unpushed.\n\n\`\`\`\n${tail(input.output, DETAIL_LINES)}\n\`\`\``;
}

/**
 * Replays the stack with the host's todo (`git rebase -i` reading it as its editor). Each conflict
 * goes to `resolve`, then the replay continues; one left unresolved aborts it.
 */
export async function replay(
  runtime: ContainerRuntime,
  container: string,
  input: { fork: string; todo: string; resolve: Resolve },
): Promise<Replayed> {
  await mustRunIn(runtime, container, [
    'sh',
    '-c',
    'printf "%s" "$1" > "$2"',
    'sh',
    input.todo,
    TODO,
  ]);
  let result = await runIn(
    runtime,
    container,
    git(['-c', 'core.editor=true', '-c', `sequence.editor=cp ${TODO}`, 'rebase', '-i', input.fork]),
  );
  let conflicts = 0;
  while (result.exitCode !== 0) {
    const output = `${result.stdout}\n${result.stderr}`;
    const stop = await stoppedAt(runtime, container);
    if (stop.files.length === 0 || conflicts === MAX_CONFLICTS) {
      const why = stop.files.length === 0 ? 'git stopped' : 'too many conflicts';
      return { error: await aborted(runtime, container, { files: stop.files, output, why }) };
    }
    conflicts += 1;
    const resolved = await input.resolve(stop);
    const left = await conflicted(runtime, container);
    if (!resolved || left.length > 0) {
      const why = 'the implementer did not resolve the conflict';
      return { error: await aborted(runtime, container, { files: stop.files, output, why }) };
    }
    result = await runIn(
      runtime,
      container,
      git(['-c', 'core.editor=true', 'rebase', '--continue']),
    );
  }
  return { conflicts };
}

/** Puts the branch back where the implementer left it, after a replay that changed the code. */
export async function putBack(
  runtime: ContainerRuntime,
  container: string,
  head: string,
): Promise<string> {
  const stat = await mustRunIn(runtime, container, git(['diff', '--stat', head, 'HEAD']));
  await mustRunIn(runtime, container, git(['reset', '--quiet', '--hard', head]));
  return stat;
}
