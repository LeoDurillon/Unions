// The `usage:backfill` script: records the token usage and tool uses of the agent calls already in the log (`DB_PATH`, else the default database).
import {
  backfillToolUsage,
  backfillUsage,
  createDb,
  DEFAULT_DB_PATH,
  migrateDb,
} from '@union/core';

const file = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const db = createDb(file);
migrateDb(db);
const usage = backfillUsage(db);
console.log(
  `Recorded the usage of ${usage.recorded} of the ${usage.read} agent calls not recorded yet in ${file}`,
);
const tools = backfillToolUsage(db);
console.log(
  `Recorded the tool uses of ${tools.recorded} of the ${tools.read} agent calls not recorded yet`,
);
