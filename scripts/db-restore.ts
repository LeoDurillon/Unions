import path from 'node:path';

import { DEFAULT_DB_PATH } from '@union/core';

import { databaseUsers } from './db-in-use';
import { backupName, restoreDatabase, summarize } from './db-tools';

const USAGE = 'Usage: bun run db:restore <backup.sqlite> [--force]';

const args = Bun.argv.slice(2);
const force = args.includes('--force');
const backup = args.find((arg) => !arg.startsWith('--'));
const target = process.env.DB_PATH ?? DEFAULT_DB_PATH;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!backup) {
  fail(USAGE);
}
const before = summarize(path.resolve(backup));
const users = force ? [] : await databaseUsers(target);
if (users.length > 0) {
  fail(
    `The database is in use (${users.join(', ')}). Stop web and worker first (bun run compose:down), or pass --force.`,
  );
}
const safety = path.join(
  path.dirname(target),
  'backups',
  backupName(new Date(), 'union-before-restore'),
);
await restoreDatabase(path.resolve(backup), target, safety);
console.log(
  `Restored ${backup} (${before.projects} projects, ${before.tickets} tickets)\n  → ${target}\n  previous database saved to ${safety}`,
);
