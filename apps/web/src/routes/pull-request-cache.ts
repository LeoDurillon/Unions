import type { PullRequestFilter } from '../api-types';
import type { Listing as Found } from './pull-request-listing';

/** How long a repository's list is reused before GitHub is asked again (Refresh always asks). */
export const PULL_REQUEST_CACHE_MS = 300_000;

/**
 * The pull request lists (and stacks) last read from GitHub, per project and filter, in this process: the page
 * opens at once, and GitHub is asked at most every few minutes. Lost on restart, which is fine.
 */
export class PullRequestCache {
  private readonly entries = new Map<string, { found: Found; at: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** The cached list when it is fresh enough, else the one `read` gets (then kept). */
  async get(
    projectId: number,
    filter: PullRequestFilter,
    read: () => Promise<Found | null>,
    refresh: boolean,
  ): Promise<{ found: Found; fetchedAt: number } | null> {
    const key = `${projectId}:${filter}`;
    const cached = this.entries.get(key);
    if (!refresh && cached && this.now() - cached.at < PULL_REQUEST_CACHE_MS) {
      return { found: cached.found, fetchedAt: cached.at };
    }
    const found = await read();
    if (!found) {
      this.entries.delete(key);
      return null;
    }
    const at = this.now();
    this.entries.set(key, { found, at });
    return { found, fetchedAt: at };
  }
}
