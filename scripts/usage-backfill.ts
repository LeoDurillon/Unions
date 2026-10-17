// The `usage:backfill` script: records the token usage of the agent calls already in the log (`DB_PATH`, else the default database).
import { backfillUsage, createDb, DEFAULT_DB_PATH, migrateDb } from '@union/core';

const file = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const db = createDb(file);
migrateDb(db);
const { read, recorded } = backfillUsage(db);
console.log(`Recorded ${recorded} of the ${read} agent calls not recorded yet in ${file}`);
