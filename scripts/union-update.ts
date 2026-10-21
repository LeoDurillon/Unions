// Union's update, started by the worker in its own process: backs the database up when migrations come, fast-forwards to `<to>`, reinstalls if needed, then ends the worker's container so compose starts it again.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { needsInstall, newMigrations } from '@union/core/union-update';

import { backUpForUpdate } from './union-update-backup';

const ROOT = path.resolve(import.meta.dir, '..');
/** Time for the web to read `union_restart` before this container goes. */
const EXIT_DELAY_MS = 2000;
/** The worker stops its runs on SIGTERM; past this, it is killed. */
const KILL_AFTER_MS = 30_000;
/** Compose runs the container with `init: true`: PID 1 is the init, the worker is its child. */
const INIT_PID = 1;

async function run(command: string[]): Promise<string> {
  const proc = Bun.spawn(command, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`${command.join(' ')}: ${stderr.trim() || `exited with ${code}`}`);
  }
  return stdout;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const install = (): Promise<string> => run(['bun', 'install', '--frozen-lockfile']);

/** Puts the checkout and its packages back as they were; the tree was clean when the update started. */
async function rollBack(from: string, reinstall: boolean): Promise<void> {
  await run(['git', 'reset', '--hard', '--quiet', from]);
  if (reinstall) {
    await install();
  }
}

/** The database is reached only once the packages match the code (core may need new ones). */
async function record(
  status: 'restarting' | 'failed',
  from: string,
  to: string,
  error = '',
): Promise<void> {
  const core = await import('@union/core');
  const db = core.openDb();
  core.setUpdateStatus(db, status, status === 'failed' ? error : null);
  core.emitEvent(
    db,
    status === 'failed'
      ? { type: 'union_update_failed', payload: { error } }
      : { type: 'union_restart', payload: { from, to, init: await core.initStartTicks() } },
  );
}

/**
 * Before the merge: the restart applies the new migrations to the live database, and the code going
 * back would not undo them. A failed backup refuses the update.
 */
async function backUpIfMigrations(changed: string[]): Promise<void> {
  const migrations = newMigrations(changed);
  if (migrations.length === 0) {
    return;
  }
  const file = await backUpForUpdate();
  const core = await import('@union/core');
  core.emitEvent(core.openDb(), { type: 'union_update_backup', payload: { file, migrations } });
}

/** Stops the container: SIGTERM to the init stops the worker, which stops its runs; then a kill. */
async function endContainer(): Promise<void> {
  await Bun.sleep(EXIT_DELAY_MS);
  process.kill(INIT_PID, 'SIGTERM');
  await Bun.sleep(KILL_AFTER_MS);
  const children = await readFile(`/proc/${INIT_PID}/task/${INIT_PID}/children`, 'utf8');
  for (const pid of children.trim().split(/\s+/u).filter(Boolean)) {
    process.kill(Number(pid), 'SIGKILL');
  }
}

async function head(): Promise<string> {
  const out = await run(['git', 'rev-parse', 'HEAD']);
  return out.trim();
}

async function changedFiles(from: string, to: string): Promise<string[]> {
  const out = await run(['git', 'diff', '--name-only', from, to]);
  return out.split('\n').filter(Boolean);
}

async function main(from: string, to: string): Promise<void> {
  let reinstall = false;
  let merged = false;
  try {
    if ((await head()) !== from) {
      throw new Error('The checkout moved since the check; check again');
    }
    const changed = await changedFiles(from, to);
    reinstall = needsInstall(changed);
    await backUpIfMigrations(changed);
    await run(['git', 'merge', '--ff-only', '--quiet', to]);
    merged = true;
    if (reinstall) {
      await install();
    }
  } catch (error) {
    let message = messageOf(error);
    try {
      if (merged) {
        await rollBack(from, reinstall);
      }
    } catch (rollBackError) {
      message += `; putting the checkout back failed too: ${messageOf(rollBackError)}`;
    }
    await record('failed', from, to, message);
    process.exitCode = 1;
    return;
  }
  await record('restarting', from, to);
  await endContainer();
}

const [from, to] = process.argv.slice(2);
if (from === undefined || to === undefined) {
  throw new Error('usage: bun scripts/union-update.ts <from sha> <to sha>');
}
await main(from, to);
