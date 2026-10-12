import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { closeDb, createDb, createTicket, migrateDb, schema } from '@union/core';

import {
  backupDatabase,
  backupName,
  processesUsing,
  resetDatabase,
  restoreDatabase,
  summarize,
  ticketContainers,
} from './db-tools';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function workdir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'union-db-test-'));
  dirs.push(dir);
  return dir;
}

function seed(file: string, title: string): void {
  const db = createDb(file);
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: title, githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  createTicket(db, { projectId: project.id, title });
  closeDb(db);
}

test('backup names sort by time', () => {
  expect(backupName(new Date(2026, 9, 12, 9, 5, 3))).toBe('union-2026-10-12-090503.sqlite');
  expect(backupName(new Date(2026, 0, 1, 0, 0, 0), 'x')).toBe('x-2026-01-01-000000.sqlite');
});

test('a backup is a readable copy, even with the source open for writing', async () => {
  const dir = await workdir();
  const live = path.join(dir, 'union.sqlite');
  seed(live, 'first');
  const writer = createDb(live);
  const copy = path.join(dir, 'backups', 'copy.sqlite');
  await backupDatabase(live, copy);
  closeDb(writer);
  expect(summarize(copy)).toEqual({ projects: 1, tickets: 1 });
});

/** Writes a ticket and dies without closing: its change stays in a real `-wal` file. */
async function leaveWal(file: string): Promise<void> {
  const script = `
    const d = new (require('bun:sqlite').Database)(${JSON.stringify(file)});
    d.run('PRAGMA wal_autocheckpoint = 0');
    d.run("insert into tickets (project_id, title) values (1, 'only in the wal')");
    console.log('written');
    setInterval(() => {}, 1000);
  `;
  const child = Bun.spawn(['bun', '-e', script], { stdout: 'pipe' });
  for await (const chunk of child.stdout) {
    if (new TextDecoder().decode(chunk).includes('written')) {
      break;
    }
  }
  child.kill('SIGKILL');
  await child.exited;
}

test('restore keeps a safety copy (with the journaled changes) and drops the stale WAL', async () => {
  const dir = await workdir();
  const live = path.join(dir, 'union.sqlite');
  const backup = path.join(dir, 'old.sqlite');
  seed(backup, 'old');
  seed(live, 'current');
  await leaveWal(live);
  expect(await stat(`${live}-wal`).catch(() => null)).not.toBeNull();

  const safety = path.join(dir, 'backups', 'before.sqlite');
  await restoreDatabase(backup, live, safety);

  expect(await stat(`${live}-wal`).catch(() => null)).toBeNull();
  expect(summarize(safety)).toEqual({ projects: 1, tickets: 2 });
  const restored = createDb(live);
  expect(
    restored
      .select()
      .from(schema.projects)
      .all()
      .map((row) => row.repo),
  ).toEqual(['old']);
  expect(restored.select().from(schema.tickets).all()).toHaveLength(1);
  closeDb(restored);
});

test('a backup whose data still sits in its own WAL restores completely', async () => {
  const dir = await workdir();
  const live = path.join(dir, 'union.sqlite');
  const backup = path.join(dir, 'copied-live-file.sqlite');
  seed(backup, 'from-wal');
  await leaveWal(backup);
  await restoreDatabase(backup, live, null);
  expect(summarize(live)).toEqual({ projects: 1, tickets: 2 });
});

test('restoring something that is not a union database is refused before touching anything', async () => {
  const dir = await workdir();
  const live = path.join(dir, 'union.sqlite');
  seed(live, 'current');
  const junk = path.join(dir, 'junk.sqlite');
  await writeFile(junk, 'not sqlite');
  expect(restoreDatabase(junk, live, null)).rejects.toThrow();
  expect(summarize(live)).toEqual({ projects: 1, tickets: 1 });
});

test('an open database is detected through /proc on Linux', async () => {
  const dir = await workdir();
  const live = path.join(dir, 'union.sqlite');
  seed(live, 'x');
  const child = Bun.spawn([
    'bun',
    '-e',
    `const d=new (require('bun:sqlite').Database)(${JSON.stringify(live)}); setInterval(()=>d.query('select 1').get(),100)`,
  ]);
  await Bun.sleep(500);
  const users = await processesUsing(live);
  child.kill();
  await child.exited;
  if (process.platform === 'linux') {
    expect(users).toContain(child.pid);
  }
});

test('reset leaves an empty, fully migrated database and a safety copy of the old one', async () => {
  const dir = await workdir();
  const live = path.join(dir, 'union.sqlite');
  seed(live, 'current');
  const db = createDb(live);
  db.update(schema.tickets)
    .set({ containerName: 'union-t1', homeVolume: 'union-t1-home', workspaceVolume: 'union-t1-ws' })
    .run();
  closeDb(db);
  expect(ticketContainers(live)).toEqual([
    { name: 'union-t1', home: 'union-t1-home', workspace: 'union-t1-ws' },
  ]);

  const safety = path.join(dir, 'backups', 'before-reset.sqlite');
  await resetDatabase(live, safety);

  expect(summarize(live)).toEqual({ projects: 0, tickets: 0 });
  expect(summarize(safety)).toEqual({ projects: 1, tickets: 1 });
  const { length: migrations } = (
    await readdir(path.join(import.meta.dir, '..', 'packages', 'core', 'drizzle'))
  ).filter((name) => name.endsWith('.sql'));
  const raw = new (await import('bun:sqlite')).Database(live, { readonly: true });
  expect(raw.query('select count(*) as n from __drizzle_migrations').get()).toEqual({
    n: migrations,
  });
  raw.close();
});
