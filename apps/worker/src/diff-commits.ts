import { parseDiff, type ContainerRuntime, type DiffFile } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';

/** Past this many commits, only the newest are kept: reading each one's diff takes a call. */
const MAX_COMMITS = 100;
const FIELD = '\u001F';
const RECORD = '\u001E';
const LOG_FORMAT = '%H%x1f%an%x1f%aI%x1f%P%x1f%s%x1f%b%x1e';

export type SnapshotCommit = {
  sha: string;
  title: string;
  body: string;
  author: string;
  date: string | null;
  parents: number;
  files: DiffFile[];
};

/** What the snapshot keeps besides the whole diff: each commit, and the change since the last review. */
export type SnapshotCommits = {
  commits: SnapshotCommit[];
  sinceReview: { sha: string; files: DiffFile[] } | null;
};

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

/** `git log`'s records, oldest first, without their files. */
export function parseLog(output: string): Omit<SnapshotCommit, 'files'>[] {
  return output
    .split(RECORD)
    .map((record) => record.replace(/^\n+/u, ''))
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [sha = '', author = '', date = '', parents = '', title = '', body = ''] =
        record.split(FIELD);
      return {
        sha,
        author,
        date: date === '' ? null : date,
        parents: parents.split(' ').filter((parent) => parent !== '').length,
        title,
        body: body.trim(),
      };
    });
}

function diffOf(
  runtime: ContainerRuntime,
  container: string,
  from: string,
  to: string,
): Promise<DiffFile[]> {
  return mustRunIn(
    runtime,
    container,
    git(['diff', '--no-color', '--no-ext-diff', '-M', from, to]),
  ).then((diff) => parseDiff(diff));
}

/** The change since the reviewed head, while it is still in the branch (a rebase drops it). */
async function sinceReview(
  runtime: ContainerRuntime,
  container: string,
  reviewed: string | null,
  head: string,
): Promise<SnapshotCommits['sinceReview']> {
  if (reviewed === null || reviewed === head) {
    return null;
  }
  const ancestor = await runIn(
    runtime,
    container,
    git(['merge-base', '--is-ancestor', reviewed, 'HEAD']),
  );
  if (ancestor.exitCode !== 0) {
    return null;
  }
  return { sha: reviewed, files: await diffOf(runtime, container, reviewed, 'HEAD') };
}

/** The commits of `base..HEAD`, each against its first parent, and the change since `reviewed`. */
export async function readCommits(
  runtime: ContainerRuntime,
  container: string,
  input: { base: string; head: string; reviewed: string | null },
): Promise<SnapshotCommits> {
  const log = await mustRunIn(
    runtime,
    container,
    git(['log', '--reverse', `--format=${LOG_FORMAT}`, `${input.base}..HEAD`]),
  );
  const commits: SnapshotCommit[] = [];
  for (const commit of parseLog(log).slice(-MAX_COMMITS)) {
    // oxlint-disable-next-line no-await-in-loop -- one git call at a time in the container
    const files = await diffOf(runtime, container, `${commit.sha}^`, commit.sha);
    commits.push({ ...commit, files });
  }
  return {
    commits,
    sinceReview: await sinceReview(runtime, container, input.reviewed, input.head),
  };
}
