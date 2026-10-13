import type { ContainerRuntime } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';

export const LEFTOVER_MESSAGE = 'chore: changes the agent left uncommitted';
/** Kept for the page: the hash covers the whole diff. */
const MAX_DIFF_CHARS = 300_000;
const MAX_HOOK_OUTPUT_CHARS = 20_000;
const SKIPPED_HOOKS_NOTE =
  "Committed without the repository's hooks (--no-verify): they refused these changes, and the user approved committing them anyway in Union.";
const STASH_MESSAGE = 'union: changes left out after a hook refused to commit them';

/** Everything the agent left uncommitted, staged: its files, its diff and the diff's hash. */
export type Leftovers = { files: string[]; diff: string; diffHash: string };

export type LeftoverCommit =
  | { kind: 'clean' }
  | { kind: 'committed' }
  | { kind: 'refused'; hookOutput: string; leftovers: Leftovers };

export type Refused = Extract<LeftoverCommit, { kind: 'refused' }>;

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

function sha256(text: string): string {
  return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

/** Stages every change and describes it, or null when the working tree is clean. */
export async function stageLeftovers(
  runtime: ContainerRuntime,
  container: string,
): Promise<Leftovers | null> {
  const status = await mustRunIn(runtime, container, git(['status', '--porcelain']));
  if (status.trim() === '') {
    return null;
  }
  await mustRunIn(runtime, container, git(['add', '-A']));
  const names = await mustRunIn(runtime, container, git(['diff', '--cached', '--name-only']));
  const diff = await mustRunIn(runtime, container, git(['diff', '--cached', '--binary']));
  return {
    files: names.split('\n').filter((line) => line.trim() !== ''),
    diff:
      diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n[… diff shortened]` : diff,
    diffHash: sha256(diff),
  };
}

/** The hook's output without the padding some linters add, keeping the end (where errors are). */
function hookOutputOf(stdout: string, stderr: string): string {
  const text = `${stdout}\n${stderr}`
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return text.length > MAX_HOOK_OUTPUT_CHARS ? `…\n${text.slice(-MAX_HOOK_OUTPUT_CHARS)}` : text;
}

/**
 * Commits whatever the agent left uncommitted, so the push contains everything it did. When the
 * repository's hook refuses it, the changes stay staged and the refusal is returned for the user.
 */
export async function commitLeftovers(
  runtime: ContainerRuntime,
  container: string,
): Promise<LeftoverCommit> {
  if (!(await stageLeftovers(runtime, container))) {
    return { kind: 'clean' };
  }
  const commit = await runIn(runtime, container, git(['commit', '-m', LEFTOVER_MESSAGE]));
  if (commit.exitCode === 0) {
    return { kind: 'committed' };
  }
  // The hook may have changed the index while it ran: described again, as the user will see it.
  const leftovers = await stageLeftovers(runtime, container);
  const withoutHooks = git([
    'commit',
    '--no-verify',
    '--dry-run',
    '--quiet',
    '-m',
    LEFTOVER_MESSAGE,
  ]);
  const dryRun = leftovers ? await runIn(runtime, container, withoutHooks) : null;
  if (!leftovers || dryRun?.exitCode !== 0) {
    const detail = hookOutputOf(commit.stdout, commit.stderr);
    throw new Error(
      `Committing the agent's leftover changes failed (exit ${commit.exitCode}): ${detail}`,
    );
  }
  return {
    kind: 'refused',
    hookOutput: hookOutputOf(commit.stdout, commit.stderr),
    leftovers,
  };
}

export type Decision =
  | { kind: 'applied' }
  /** The changes are not the ones the user decided on: they must decide again. */
  | { kind: 'changed'; leftovers: Leftovers | null };

/** Commits the refused changes without the hooks, or sets them aside in a stash. */
export async function applyDecision(
  runtime: ContainerRuntime,
  container: string,
  decision: { resolution: 'commit' | 'discard'; message: string; diffHash: string },
): Promise<Decision> {
  const leftovers = await stageLeftovers(runtime, container);
  if (leftovers?.diffHash !== decision.diffHash) {
    return { kind: 'changed', leftovers };
  }
  await mustRunIn(
    runtime,
    container,
    decision.resolution === 'commit'
      ? git(['commit', '--no-verify', '-m', decision.message, '-m', SKIPPED_HOOKS_NOTE])
      : git(['stash', 'push', '--include-untracked', '-m', STASH_MESSAGE]),
  );
  return { kind: 'applied' };
}

const PROPOSED = /^\s*Refused commit:\s*(?<message>.+?)\s*$/gmu;

/** The message the agent asked for at the end of its report (`Refused commit: …`), else a default. */
export function proposedMessage(report: string): string {
  const last = [...report.matchAll(PROPOSED)].at(-1)?.groups?.message ?? '';
  const message = last.replaceAll(/^[`"']+|[`"']+$/gu, '').trim();
  return message === '' ? LEFTOVER_MESSAGE : message;
}

/** Tells the agent what to do when a hook refuses its commit, so the user can decide. */
export const COMMIT_HOOK_HINT =
  '\n\nIf a git hook refuses one of your commits for a reason outside this task (for example warnings already in a file you had to change), do not bypass it with `--no-verify`. Leave those changes staged, explain in your report why the hook refuses them, and end the report with the line `Refused commit: <the commit message you wanted>`. The user then decides whether to commit them without the hooks.';
