// The database copy an update takes before a commit that brings migrations, and the pruning of older ones.
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_DB_PATH } from '@union/core';
import { UPDATE_BACKUP_PREFIX, updateBackupsToDrop } from '@union/core/union-update';

import { backupDatabase, backupName } from './db-tools';

/** Copies the database (safe while web and worker write), then keeps only the newest update backups. */
export async function backUpForUpdate(): Promise<string> {
  const source = process.env.DB_PATH ?? DEFAULT_DB_PATH;
  const dir = path.join(path.dirname(source), 'backups');
  const file = path.join(dir, backupName(new Date(), UPDATE_BACKUP_PREFIX));
  await backupDatabase(source, file);
  for (const name of updateBackupsToDrop(await readdir(dir))) {
    await rm(path.join(dir, name));
  }
  return file;
}
