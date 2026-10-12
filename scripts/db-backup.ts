import path from 'node:path';

import { DEFAULT_DB_PATH } from '@union/core';

import { backupDatabase, backupName, summarize } from './db-tools';

const source = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const destination = path.resolve(
  Bun.argv[2] ?? path.join(path.dirname(source), 'backups', backupName(new Date())),
);

await backupDatabase(source, destination);
const { projects, tickets } = summarize(destination);
console.log(`Backed up ${source}\n  → ${destination}\n  ${projects} projects, ${tickets} tickets`);
