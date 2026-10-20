// Git for a stack: its commits with their trailers, the lower slices' branches, a slice tip checked out.
import type { ContainerRuntime, StackCommit } from '@union/core';

import { mustRunIn } from './container-exec';
import { hostGit, REPO_DIR, type CloneSource } from './provision';

const FIELD = '\u001F';
const RECORD = '\u001E';

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

/** The commits after `fork` up to HEAD, oldest first, with their messages' bodies (trailers). */
export async function stackCommits(
  runtime: ContainerRuntime,
  container: string,
  fork: string,
): Promise<StackCommit[]> {
  const format = `--format=%H${FIELD}%s${FIELD}%b${RECORD}`;
  const output = await mustRunIn(
    runtime,
    container,
    git(['log', '--reverse', format, `${fork}..HEAD`]),
  );
  return output
    .split(RECORD)
    .map((record) => record.replace(/^\n/u, ''))
    .filter((record) => record !== '')
    .map((record) => {
      const [sha = '', subject = '', body = ''] = record.split(FIELD);
      return { sha, subject, body };
    });
}

/** Points each lower slice's local branch at its tip. */
export async function setBranches(
  runtime: ContainerRuntime,
  container: string,
  branches: readonly { branch: string; sha: string }[],
): Promise<void> {
  for (const { branch, sha } of branches) {
    await mustRunIn(runtime, container, git(['branch', '--force', branch, sha]));
  }
}

/** Checks out `ref` detached (a slice's tip, to run the checks on it), or a branch again. */
export async function checkout(
  runtime: ContainerRuntime,
  container: string,
  ref: { detach: string } | { branch: string },
): Promise<void> {
  const args =
    'detach' in ref
      ? ['checkout', '--quiet', '--detach', ref.detach]
      : ['checkout', '--quiet', ref.branch];
  await mustRunIn(runtime, container, git(args));
}

/** The lower slices' branches GitHub has now (`<branch>-s<n>`), each with its commit. */
export async function remoteSliceBranches(
  source: CloneSource,
  branch: string,
): Promise<Map<string, string>> {
  const output = await hostGit(['ls-remote', '--heads', source.url], source.secret);
  const prefix = `refs/heads/${branch}-s`;
  const found = new Map<string, string>();
  for (const line of output.split('\n')) {
    const [sha, ref] = line.split('\t');
    if (sha && ref?.startsWith(prefix) && /^\d+$/u.test(ref.slice(prefix.length))) {
      found.set(ref.slice('refs/heads/'.length), sha);
    }
  }
  return found;
}
