// The repository's entries as folders, each with its children in the order the tree shows them.

import type { RepositoryEntry } from '../../../src/repository-api-types';

/** Folder path (`''` for the root) → its entries, folders first, then by name. */
export type RepoIndex = Map<string, RepositoryEntry[]>;

/** The folder holding a path: `''` for the root. */
export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** The last part of a path. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function byKindThenName(a: RepositoryEntry, b: RepositoryEntry): number {
  const aDir = a.type === 'dir' ? 0 : 1;
  const bDir = b.type === 'dir' ? 0 : 1;
  return aDir - bDir || nameOf(a.path).localeCompare(nameOf(b.path));
}

/**
 * Adds entries to the index, by their parent folder; a folder read later (a truncated tree) adds its own.
 * Each folder's list is sorted once all of its entries are in.
 */
export function indexEntries(entries: RepositoryEntry[], into: RepoIndex = new Map()): RepoIndex {
  const touched = new Set<string>();
  for (const entry of entries) {
    const parent = parentOf(entry.path);
    const siblings = into.get(parent) ?? [];
    if (!siblings.some((sibling) => sibling.path === entry.path)) {
      siblings.push(entry);
    }
    into.set(parent, siblings);
    touched.add(parent);
  }
  for (const parent of touched) {
    into.get(parent)?.sort(byKindThenName);
  }
  return into;
}

/** Every folder from the root down to the path's own folder, the root excluded: what must be open to show it. */
export function foldersTo(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}
