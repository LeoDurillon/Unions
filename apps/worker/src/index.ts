import { DockerCli, migrateDb, openDb } from '@union/core';

import { drainCommands, type CommandHooks } from './commands';
import { createExecutor } from './executor';
import type { GitHubApi } from './github/api';
import { runGitHubLoop } from './github/loop';
import { GitHubMirror } from './github/mirror';
import { OctokitGitHubApi } from './github/octokit-api';
import { removeContainers } from './janitor';
import { defaultProvisionConfig } from './provision';
import { Scheduler } from './scheduler';

const POLL_MS = 500;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_GITHUB_PULL_MS = 30_000;

const db = openDb();
migrateDb(db);

const maxConcurrent = Number(process.env.UNION_MAX_CONCURRENT ?? DEFAULT_MAX_CONCURRENT);
const runtime = new DockerCli();
const hooks: CommandHooks = {
  removeContainers: (containers) => {
    void removeContainers(db, runtime, containers);
  },
};

const apis = new Map<string, GitHubApi>();
/** A project's own token wins; `GITHUB_TOKEN` is the fallback for projects without one. */
const apiFor = (project: { githubToken: string | null }): GitHubApi | null => {
  const token = project.githubToken ?? process.env.GITHUB_TOKEN;
  if (!token) {
    return null;
  }
  const known = apis.get(token) ?? new OctokitGitHubApi(token);
  apis.set(token, known);
  return known;
};

const executor = createExecutor(db, runtime, defaultProvisionConfig(), apiFor);
const scheduler = new Scheduler(db, executor, maxConcurrent);

const shutdown = new AbortController();
const stop = (): void => {
  scheduler.stop();
  shutdown.abort();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const githubLoop = runGitHubLoop(
  new GitHubMirror(db, apiFor),
  Number(process.env.UNION_GITHUB_PULL_MS ?? DEFAULT_GITHUB_PULL_MS),
  shutdown.signal,
);

console.log(`worker running (max ${maxConcurrent} concurrent runs, GitHub sync per project token)`);
while (!shutdown.signal.aborted) {
  drainCommands(db, hooks);
  scheduler.tick();
  await Bun.sleep(POLL_MS);
}
await Promise.all([scheduler.idle(), githubLoop]);
// Exit explicitly: under `bun --watch` the process would otherwise stay alive after a signal.
process.exit(0);
