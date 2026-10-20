// The host's own `git rebase` onto the base, tried before any agent: up to date, clean, or stopped.
import type { ContainerRuntime } from '@union/core';

import { runIn } from './container-exec';
import { tail } from './gate';
import { REPO_DIR } from './provision';
import { contains, restoreBranch } from './rebase-git';

const DETAIL_LINES = 20;

/** What the host's rebase did; a stopped one was aborted, the branch back as it was. */
export type HostRebase =
  | { kind: 'up_to_date' }
  | { kind: 'clean' }
  | { kind: 'stopped'; files: string[]; detail: string };

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

/** The files left in conflict, read before the abort. */
async function conflictedFiles(runtime: ContainerRuntime, container: string): Promise<string[]> {
  const result = await runIn(runtime, container, git(['diff', '--name-only', '--diff-filter=U']));
  return result.stdout.split('\n').filter((line) => line.trim() !== '');
}

/**
 * Rebases the branch onto `origin/<base>` with git alone. No hook runs on the picked commits, so
 * nothing can refuse them; on a conflict (or any other stop) the branch is put back at `before`.
 * `updateRefs`: a stack's slice branches move with their commits; `onto`: only the commits after it
 * are moved (a restack after a slice merged).
 */
export async function tryHostRebase(
  runtime: ContainerRuntime,
  container: string,
  refs: { base: string; branch: string; before: string; updateRefs?: boolean; onto?: string },
): Promise<HostRebase> {
  if (await contains(runtime, container, 'HEAD', `origin/${refs.base}`)) {
    return { kind: 'up_to_date' };
  }
  const result = await runIn(
    runtime,
    container,
    git([
      '-c',
      'core.editor=true',
      'rebase',
      ...(refs.updateRefs ? ['--update-refs'] : []),
      // Only the commits after the merged slice's tip: the base already has that slice.
      ...(refs.onto === undefined
        ? [`origin/${refs.base}`]
        : ['--onto', `origin/${refs.base}`, refs.onto]),
    ]),
  );
  if (result.exitCode === 0) {
    return { kind: 'clean' };
  }
  const files = await conflictedFiles(runtime, container);
  await restoreBranch(runtime, container, refs.branch, refs.before);
  return {
    kind: 'stopped',
    files,
    detail: tail(`${result.stdout}\n${result.stderr}`, DETAIL_LINES),
  };
}

/** Appended to the rebase prompt: why the agent is called. */
export function stoppedHint(
  base: string,
  stopped: Extract<HostRebase, { kind: 'stopped' }>,
): string {
  const files =
    stopped.files.length > 0
      ? `, with conflicts in ${stopped.files.map((file) => `\`${file}\``).join(', ')}`
      : '';
  return `\n\nThe host's \`git rebase origin/${base}\` stopped${files}. It was aborted, so the branch is as it was: rebase it yourself and resolve the conflicts.\n\n\`\`\`\n${stopped.detail}\n\`\`\``;
}

/** Appended to the rebase prompt of a split ticket: the slices' branches must move too. */
export function stackHint(base: string, branches: readonly string[], onto?: string): string {
  const command =
    onto === undefined
      ? `git rebase --update-refs origin/${base}`
      : `git rebase --update-refs --onto origin/${base} ${onto}`;
  const merged =
    onto === undefined
      ? ''
      : ` The slice below them was merged into \`origin/${base}\` (its last commit was \`${onto}\`): move only the commits after it.`;
  if (branches.length === 0) {
    return merged === '' ? '' : `\n\n${merged.trim()} Run \`${command}\`.`;
  }
  const names = branches.map((name) => `\`${name}\``).join(', ');
  return `\n\nThis branch is a stack: the branches ${names} point at commits inside it, one per slice.${merged} Rebase with \`${command}\` so they move with their commits.`;
}

/** Appended to the rebase prompt when the host's rebase was clean but the checks fail after it. */
export function checksFailedHint(
  base: string,
  checks: { command: string; exitCode: number; tail: string },
): string {
  return `\n\nThe host already rebased the branch onto \`origin/${base}\` without conflicts, but the checks (\`${checks.command}\`) now fail (exit ${checks.exitCode}):\n\n\`\`\`\n${checks.tail}\n\`\`\`\n\nThere is nothing left to rebase: fix what the base's changes broke, and commit the fix.`;
}
