// Union's own update, the pure part: what the checkout's git state allows, and when to reinstall.

/** The only branch Union updates, always by fast-forward. */
export const UPDATE_BRANCH = 'main';
export const UPDATE_REMOTE_REF = `origin/${UPDATE_BRANCH}`;
/** How often the worker fetches the remote. */
export const UPDATE_CHECK_MS = 600_000;
/** Commit subjects kept for the sidebar's title. */
export const UPDATE_SUBJECTS = 10;
/** An update that has not moved on for this long died with its process. */
export const UPDATE_STALE_MS = 900_000;

/** What a check reads of the checkout. */
export type CheckoutFacts = {
  /** Null when `HEAD` is detached. */
  branch: string | null;
  /** Tracked files changed (untracked ones do not stop a fast-forward unless it would overwrite them). */
  dirty: boolean;
  ahead: number;
  /** Whether something starts web and worker again once they exit (compose's restart policy). */
  supervised: boolean;
};

/** Why the checkout cannot update, or null when it can (whether there is anything to pull or not). */
export function updateRefusal(facts: CheckoutFacts): string | null {
  if (!facts.supervised) {
    return 'Not running under compose: nothing would start Union again after the update';
  }
  if (facts.branch !== UPDATE_BRANCH) {
    return facts.branch === null
      ? `HEAD is detached; check out ${UPDATE_BRANCH} to update`
      : `On branch ${facts.branch}; only ${UPDATE_BRANCH} updates`;
  }
  if (facts.dirty) {
    return 'The checkout has uncommitted changes';
  }
  if (facts.ahead > 0) {
    return `${facts.ahead} local commit${facts.ahead === 1 ? '' : 's'} not on ${UPDATE_REMOTE_REF}: cannot fast-forward`;
  }
  return null;
}

/** `git rev-list --left-right --count HEAD...<remote>`: commits only local, then only remote. */
export function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const [ahead, behind] = output.trim().split(/\s+/u).map(Number);
  if (ahead === undefined || behind === undefined || Number.isNaN(ahead + behind)) {
    throw new Error(`Unexpected rev-list output: ${output}`);
  }
  return { ahead, behind };
}

/** Whether the files an update changed need `bun install` before Union starts again. */
export function needsInstall(changed: string[]): boolean {
  return changed.some(
    (file) => file === 'bun.lock' || file === 'bunfig.toml' || file.endsWith('package.json'),
  );
}
