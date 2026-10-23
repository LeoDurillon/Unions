// Backs up, restores and resets the database, for the `db:*` scripts.
import { Database } from 'bun:sqlite';
import { mkdir, readdir, readlink, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { closeDb, createDb, migrateDb } from '@union/core';

const PAD = 2;

function two(value: number): string {
  return String(value).padStart(PAD, '0');
}

/** `union-2026-10-12-143005.sqlite`: sortable, one per second. */
export function backupName(date: Date, prefix = 'union'): string {
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  const time = `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  return `${prefix}-${day}-${time}.sqlite`;
}

/** A consistent copy, safe while web and worker are writing (SQLite `VACUUM INTO`). */
export async function backupDatabase(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const db = new Database(source, { readonly: true });
  try {
    db.run('VACUUM INTO ?', [destination]);
  } finally {
    db.close();
  }
}

export type Summary = { projects: number; tickets: number };

/** Counts in a union database; throws when the file is not one. */
export function summarize(file: string): Summary {
  const db = new Database(file, { readonly: true });
  try {
    const count = (table: string): number => {
      const row: unknown = db.query(`select count(*) as n from ${table}`).get();
      return typeof row === 'object' && row !== null && 'n' in row && typeof row.n === 'number'
        ? row.n
        : 0;
    };
    return { projects: count('projects'), tickets: count('tickets') };
  } catch {
    throw new Error(`${file} is not a union database (no projects/tickets tables)`);
  } finally {
    db.close();
  }
}

/** Host processes with the database open (Linux /proc; elsewhere nothing is found). */
export async function processesUsing(file: string): Promise<number[]> {
  const target = path.resolve(file);
  const pids = await readdir('/proc').catch(() => [] as string[]);
  const users: number[] = [];
  for (const pid of pids.filter((entry) => /^\d+$/u.test(entry) && Number(entry) !== process.pid)) {
    const fds = await readdir(`/proc/${pid}/fd`).catch(() => [] as string[]);
    for (const fd of fds) {
      const link = await readlink(`/proc/${pid}/fd/${fd}`).catch(() => '');
      if (link === target || link.startsWith(`${target}-`)) {
        users.push(Number(pid));
        break;
      }
    }
  }
  return users;
}

/**
 * Replaces `target` with `backup`, after saving the current database (journal included) to
 * `safetyCopy`. The target's WAL and shared-memory files are removed, or SQLite would replay the old
 * journal onto the restored file. The new file is rebuilt with `VACUUM INTO` rather than copied: in
 * WAL mode a database's latest data can sit in its `-wal` file, which a plain copy would miss.
 */
export async function restoreDatabase(
  backup: string,
  target: string,
  safetyCopy: string | null,
): Promise<void> {
  summarize(backup);
  if (safetyCopy && (await stat(target).catch(() => null))) {
    await backupDatabase(target, safetyCopy);
  }
  await rm(target, { force: true });
  await rm(`${target}-wal`, { force: true });
  await rm(`${target}-shm`, { force: true });
  await backupDatabase(backup, target);
}

export type AgentContainer = { name: string; home: string; workspace: string };

/** The agent containers and volumes the database's tickets own (removed with them on a reset). */
export function ticketContainers(file: string): AgentContainer[] {
  const db = new Database(file, { readonly: true });
  try {
    const rows: unknown[] = db
      .query(
        'select container_name, home_volume, workspace_volume from tickets where container_name is not null',
      )
      .all();
    return rows.flatMap((row) =>
      typeof row === 'object' &&
      row !== null &&
      'container_name' in row &&
      'home_volume' in row &&
      'workspace_volume' in row &&
      typeof row.container_name === 'string' &&
      typeof row.home_volume === 'string' &&
      typeof row.workspace_volume === 'string'
        ? [{ name: row.container_name, home: row.home_volume, workspace: row.workspace_volume }]
        : [],
    );
  } finally {
    db.close();
  }
}

/** Saves the current database to `safetyCopy`, then starts over with an empty, fully migrated one. */
export async function resetDatabase(target: string, safetyCopy: string | null): Promise<void> {
  if (safetyCopy && (await stat(target).catch(() => null))) {
    await backupDatabase(target, safetyCopy);
  }
  await rm(target, { force: true });
  await rm(`${target}-wal`, { force: true });
  await rm(`${target}-shm`, { force: true });
  const db = createDb(target);
  try {
    migrateDb(db);
  } finally {
    closeDb(db);
  }
}
