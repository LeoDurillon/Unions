import path from 'node:path';

import { processesUsing } from './db-tools';

/** Compose services run in their own mount namespace, so /proc on the host does not see their files. */
async function composeRunning(directory: string): Promise<string[]> {
  const proc = Bun.spawn(['docker', 'compose', 'ps', '--status', 'running', '--services'], {
    cwd: directory,
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const output = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    return [];
  }
  return output.split('\n').filter((name) => name === 'web' || name === 'worker');
}

/** Who has the database open: host processes and the compose web/worker services. Empty means free. */
export async function databaseUsers(target: string): Promise<string[]> {
  const local = await processesUsing(target);
  const compose = await composeRunning(path.dirname(target)).catch(() => []);
  return [...local.map((pid) => `process ${pid}`), ...compose.map((name) => `compose ${name}`)];
}
