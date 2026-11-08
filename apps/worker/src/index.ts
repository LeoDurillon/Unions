// The worker's entry point: opens the database and starts the scheduler and the GitHub loop.
import { DockerCli, emitEvent, migrateDb, openDb } from '@union/core';

import { agentImageProvision } from './agent-image/images';
import { drainCommands } from './commands';
import { createExecutor } from './executor';
import { githubApis } from './github/clients';
import { runGitHubLoop } from './github/loop';
import { GitHubMirror } from './github/mirror';
import { workerHooks } from './hooks';
import { Scheduler } from './scheduler';
import { startSideRuns } from './side-runs';

const POLL_MS = 500;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_GITHUB_PULL_MS = 30_000;

const db = openDb();
migrateDb(db);

// A promise nobody awaited that failed: logged and recorded, so it neither goes unseen nor stops the worker.
process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  console.error('unhandled rejection in the worker:', error);
  try {
    emitEvent(db, { type: 'worker_error', payload: { error } });
  } catch {
    // The database itself failed: the log line above is all there is.
  }
});

const maxConcurrent = Number(process.env.UNION_MAX_CONCURRENT ?? DEFAULT_MAX_CONCURRENT);
const runtime = new DockerCli();
const { config: provisionConfig, agentImages } = agentImageProvision(db, runtime);
agentImages.recover();

const apiFor = githubApis(db);

const executor = createExecutor(db, runtime, provisionConfig, apiFor);
const scheduler = new Scheduler(db, executor, maxConcurrent);
await scheduler.recover((name) => runtime.stop(name));
// Investigations, agent reviews and description rewrites take their runs from the scheduler's slots:
// UNION_MAX_CONCURRENT caps all.
const sideRuns = await startSideRuns({
  db,
  runtime,
  config: provisionConfig,
  slots: scheduler.slots,
  apiFor,
});
const hooks = workerHooks({
  db,
  runtime,
  config: provisionConfig,
  ...sideRuns,
  apiFor,
  agentImages,
});

const shutdown = new AbortController();
const stop = (): void => {
  scheduler.stop();
  sideRuns.stop();
  agentImages.stop();
  shutdown.abort();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const githubLoop = runGitHubLoop(
  new GitHubMirror(db, apiFor),
  Number(process.env.UNION_GITHUB_PULL_MS ?? DEFAULT_GITHUB_PULL_MS),
  shutdown.signal,
);

console.log(
  `worker running (max ${maxConcurrent} concurrent runs, GitHub sync per project credentials)`,
);
while (!shutdown.signal.aborted) {
  drainCommands(db, hooks);
  sideRuns.updater.tick();
  // While Union updates itself, nothing new starts: the restart would interrupt it.
  if (!sideRuns.updater.paused()) {
    scheduler.tick();
    sideRuns.tick();
  }
  await Bun.sleep(POLL_MS);
}
await Promise.all([scheduler.idle(), sideRuns.idle(), githubLoop, agentImages.idle()]);
// Exit explicitly: under `bun --watch` the process would otherwise stay alive after a signal.
process.exit(0);
