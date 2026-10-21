// Git in Union's own checkout: fetching `origin/main` (over SSH with the host's keys, never prompting) and reading where it stands.
import path from 'node:path';

import {
  MIGRATIONS_DIR,
  newMigrations,
  parseAheadBehind,
  UPDATE_BRANCH,
  UPDATE_REMOTE_REF,
  UPDATE_SUBJECTS,
  updateRefusal,
  type UpdateCheck,
} from '@union/core';

/** The checkout web and worker run from. */
export const UNION_ROOT = path.resolve(import.meta.dir, '..', '..', '..');

const FETCH_TIMEOUT_MS = 60_000;
const READ_TIMEOUT_MS = 10_000;

/** A fetch must fail rather than wait on a passphrase or an unknown host key. */
const NO_PROMPT = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes',
};

export async function git(args: string[], timeout = READ_TIMEOUT_MS): Promise<string> {
  const proc = Bun.spawn(['git', '-C', UNION_ROOT, ...args], {
    env: { ...process.env, ...NO_PROMPT },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `git ${args[0] ?? ''} exited with ${code}`);
  }
  return stdout;
}

async function gitLine(args: string[]): Promise<string> {
  const out = await git(args);
  return out.trim();
}

async function gitLines(args: string[]): Promise<string[]> {
  const out = await git(args);
  return out.split('\n').filter((line) => line !== '');
}

async function fetchRemote(): Promise<string | null> {
  try {
    await git(['fetch', '--quiet', 'origin', UPDATE_BRANCH], FETCH_TIMEOUT_MS);
    return null;
  } catch (error) {
    return `Could not fetch ${UPDATE_REMOTE_REF}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function remoteSha(): Promise<string | null> {
  try {
    return await gitLine(['rev-parse', '--verify', '--quiet', UPDATE_REMOTE_REF]);
  } catch {
    return null;
  }
}

/** The checkout against the remote's `main`, fetched now; a failed fetch compares with the last one. */
export async function checkCheckout(supervised: boolean): Promise<UpdateCheck> {
  const fetchError = await fetchRemote();
  const localSha = await gitLine(['rev-parse', 'HEAD']);
  const branch = (await gitLine(['branch', '--show-current'])) || null;
  const dirty = (await gitLine(['status', '--porcelain', '--untracked-files=no'])) !== '';
  const remote = await remoteSha();
  const counts = remote
    ? parseAheadBehind(await git(['rev-list', '--left-right', '--count', `HEAD...${remote}`]))
    : { ahead: 0, behind: 0 };
  const behind = counts.behind > 0 && remote !== null;
  const subjects = behind
    ? await gitLines(['log', '--format=%s', `-n${UPDATE_SUBJECTS}`, `HEAD..${remote}`])
    : [];
  const migrations = behind
    ? newMigrations(
        await gitLines(['diff', '--name-only', `HEAD...${remote}`, '--', MIGRATIONS_DIR]),
      )
    : [];
  return {
    localSha,
    remoteSha: remote,
    ...counts,
    subjects,
    migrations: migrations.length,
    refusal: updateRefusal({ branch, dirty, ahead: counts.ahead, supervised }),
    error: fetchError,
  };
}
