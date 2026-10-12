import path from 'node:path';

import { DEFAULT_DB_PATH, DockerCli } from '@union/core';

import { databaseUsers } from './db-in-use';
import { backupName, resetDatabase, summarize, ticketContainers } from './db-tools';

const args = new Set(Bun.argv.slice(2));
const target = process.env.DB_PATH ?? DEFAULT_DB_PATH;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { projects, tickets } = await Bun.file(target)
  .exists()
  .then((exists) => (exists ? summarize(target) : { projects: 0, tickets: 0 }));
const containers = await Bun.file(target)
  .exists()
  .then((exists) => (exists ? ticketContainers(target) : []));

if (!args.has('--yes')) {
  fail(
    [
      `This empties ${target} (${projects} projects, ${tickets} tickets) and re-applies the migrations.`,
      `It also removes the agent containers and volumes of those tickets (${containers.map((c) => c.name).join(', ') || 'none'}).`,
      'A backup is saved to backups/ first. GitHub issues, PRs and Notion pages are not touched.',
      'Run again with --yes to proceed: bun run db:reset --yes',
    ].join('\n'),
  );
}
const users = args.has('--force') ? [] : await databaseUsers(target);
if (users.length > 0) {
  fail(
    `The database is in use (${users.join(', ')}). Stop web and worker first (bun run compose:down), or pass --force.`,
  );
}

const safety = path.join(
  path.dirname(target),
  'backups',
  backupName(new Date(), 'union-before-reset'),
);
await resetDatabase(target, projects + tickets > 0 ? safety : null);
const runtime = new DockerCli();
for (const container of containers) {
  await runtime.remove(container.name, { home: container.home, workspace: container.workspace });
}
console.log(
  [
    `Reset ${target}: empty and migrated.`,
    projects + tickets > 0
      ? `  previous database saved to ${safety}`
      : '  (it was already empty: no backup made)',
    `  removed ${containers.length} agent container(s) with their volumes`,
  ].join('\n'),
);
