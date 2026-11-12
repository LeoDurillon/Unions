// The Repository tab's tree state: the folders open, and those read one at a time when GitHub truncated the tree.

import { useMemo, useState } from 'react';

import type { RepositoryEntry, RepositoryTree } from '../../../src/repository-api-types';
import { foldersTo, indexEntries, type RepoIndex } from '../../lib/repository/repo-tree';
import { readFolder } from '../../lib/repository/repository-api';

export type RepoTreeState = {
  index: RepoIndex;
  /** Every entry known, by path. */
  byPath: Map<string, RepositoryEntry>;
  open: Set<string>;
  /** Folders being read (a truncated tree). */
  loading: Set<string>;
  error: Error | null;
  toggle: (folder: RepositoryEntry) => void;
  /** Opens the folders down to a path, so it shows in the tree. */
  reveal: (path: string) => void;
};

function flipped(set: Set<string>, key: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
}

/** The tree's state, the folders down to `selected` open at first. Key it by the tree's sha. */
export function useRepoTree(
  projectId: number,
  tree: RepositoryTree,
  selected: string | null,
): RepoTreeState {
  const [more, setMore] = useState<RepositoryEntry[]>([]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(foldersTo(selected ?? '')));
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [loadError, setLoadError] = useState<Error | null>(null);
  const entries = useMemo(() => [...tree.entries, ...more], [tree, more]);
  const index = useMemo(() => indexEntries(entries), [entries]);
  const byPath = useMemo(() => new Map(entries.map((entry) => [entry.path, entry])), [entries]);

  const load = async (folder: RepositoryEntry): Promise<void> => {
    setLoading((current) => flipped(current, folder.path, true));
    try {
      const read = await readFolder(projectId, folder);
      setMore((current) => [...current, ...read.entries]);
    } catch (error) {
      setLoadError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading((current) => flipped(current, folder.path, false));
    }
  };

  const toggle = (folder: RepositoryEntry): void => {
    const opening = !open.has(folder.path);
    setOpen((current) => flipped(current, folder.path, opening));
    if (opening && tree.truncated && !index.has(folder.path) && !loading.has(folder.path)) {
      void load(folder);
    }
  };

  const reveal = (path: string): void => {
    setOpen((current) => new Set([...current, ...foldersTo(path)]));
  };

  return { index, byPath, open, loading, error: loadError, toggle, reveal };
}
