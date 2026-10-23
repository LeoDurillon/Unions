// Brings the base branch and the pushed branch, as they are on GitHub now, into the container: the
// host fetches them with the project's credentials and hands over a git bundle, since the container
// has none.
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContainerRuntime } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { hostGit, REPO_DIR, type CloneSource } from './provision';

const INBOX = '/tmp/union-fetch';
const BUNDLE = 'refs.bundle';

type FetchRefs = {
  base: string;
  branch: string;
  extra?: readonly string[];
  left?: { name: string; source: string };
};

/** What the host fetches from GitHub, each into `refs/heads/<name>` of its bare copy. */
function hostRefspecs(refs: FetchRefs): string[] {
  const { base, branch, extra = [], left } = refs;
  return [
    `+refs/heads/${base}:refs/heads/${base}`,
    `+refs/heads/${branch}:refs/heads/${branch}`,
    ...extra.map((name) => `+refs/heads/${name}:refs/heads/${name}`),
    ...(left ? [`+${left.source}:refs/heads/${left.name}`] : []),
  ];
}

/** git's "couldn't find remote ref" for the base, said plainly. */
function missingBase(error: unknown, base: string): Error {
  const message = String(error);
  if (!message.includes(`remote ref refs/heads/${base}`)) {
    return error instanceof Error ? error : new Error(message);
  }
  return new Error(
    `The base \`${base}\` no longer exists on GitHub. If its pull request was merged, Union follows the pull request's new base at its next check of GitHub; else change target.`,
  );
}

/**
 * Brings the base branch and the pushed branch, as they are on GitHub now, into the container: the
 * host fetches them with the project's credentials and hands over a git bundle, since the container
 * has none. Sets `origin/<base>`, the local `<base>` (diffs compare with it) and `origin/<branch>`,
 * and `origin/<b>` for each of `extra` (a stack's lower slices, which must exist on GitHub), and
 * `origin/<left.name>` from `left.source` (the base a change of target leaves, maybe a pull ref).
 * Returns the pushed branch's commit, which the force-push later leases on.
 */
export async function fetchIntoContainer(
  runtime: ContainerRuntime,
  container: string,
  source: CloneSource,
  refs: FetchRefs,
): Promise<string> {
  const { base, branch } = refs;
  const extra = [...(refs.extra ?? []), ...(refs.left ? [refs.left.name] : [])];
  const dir = await mkdtemp(path.join(tmpdir(), 'union-fetch-'));
  try {
    const bare = path.join(dir, 'repo.git');
    const inbox = path.join(dir, 'inbox');
    await hostGit(['init', '--quiet', '--bare', bare], null);
    await hostGit(
      ['-C', bare, 'fetch', '--quiet', source.url, ...hostRefspecs(refs)],
      source.secret,
    ).catch((error: unknown) => {
      throw missingBase(error, base);
    });
    const head = await hostGit(['-C', bare, 'rev-parse', `refs/heads/${branch}`], null);
    const pushed = head.trim();
    await mkdir(inbox);
    await hostGit(
      [
        '-C',
        bare,
        'bundle',
        'create',
        path.join(inbox, BUNDLE),
        `refs/heads/${base}`,
        `refs/heads/${branch}`,
        ...extra.map((name) => `refs/heads/${name}`),
      ],
      null,
    );
    await runtime.copyIn(container, inbox, INBOX);
    await mustRunIn(runtime, container, [
      'git',
      '-C',
      REPO_DIR,
      'fetch',
      '--quiet',
      `${INBOX}/${BUNDLE}`,
      `+refs/heads/${base}:refs/remotes/origin/${base}`,
      `+refs/heads/${base}:refs/heads/${base}`,
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ...extra.map((name) => `+refs/heads/${name}:refs/remotes/origin/${name}`),
    ]);
    return pushed;
  } finally {
    await rm(dir, { recursive: true, force: true });
    await runIn(runtime, container, ['rm', '-rf', INBOX]);
  }
}
