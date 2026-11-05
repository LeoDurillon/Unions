// The Repository tab in the URL (`?view=repository&repo-ref=main&repo-path=src/a.ts`), so a reload and
// Back keep the branch and file looked at.
import { useCallback } from 'react';

import { setParams, useUrlParam } from './url-state';

/** Spread into `setParams` when the tab closes, so its branch and file do not outlive it. */
export const CLOSE_REPOSITORY = { view: null, 'repo-ref': null, 'repo-path': null } as const;

/** Whether the URL opens the Repository tab. */
export function useRepositoryOpen(): boolean {
  return useUrlParam('view') === 'repository';
}

/** Opens the Repository tab where it was left. */
export function openRepository(): void {
  setParams({ view: 'repository' });
}

/** The branch, tag or sha looked at (null: the base branch), and the file or folder picked (null: none). */
export function useRepositoryLocation(): {
  ref: string | null;
  path: string | null;
  setPath: (path: string | null) => void;
} {
  const ref = useUrlParam('repo-ref');
  const path = useUrlParam('repo-path');
  const setPath = useCallback((next: string | null): void => {
    setParams({ 'repo-path': next });
  }, []);
  return { ref, path, setPath };
}
