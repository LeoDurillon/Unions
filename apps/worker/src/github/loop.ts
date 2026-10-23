// Pushes every second and pulls every `pullIntervalMs`, one call at a time, until aborted.
import type { GitHubMirror } from './mirror';

const PUSH_INTERVAL_MS = 1000;

/** Pushes every second and pulls every `pullIntervalMs`, one call at a time, until aborted. */
export async function runGitHubLoop(
  sync: GitHubMirror,
  pullIntervalMs: number,
  signal: AbortSignal,
): Promise<void> {
  let lastPull = 0;
  while (!signal.aborted) {
    await sync.push();
    if (Date.now() - lastPull >= pullIntervalMs) {
      await sync.pull();
      lastPull = Date.now();
    }
    await Bun.sleep(PUSH_INTERVAL_MS);
  }
}
