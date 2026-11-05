// The Repository tab's reads: the commit a branch names, the tree at it (a folder at a time when GitHub
// truncated it), one file. Trees and files are named by their sha, so they are never read twice.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { REPOSITORY_FILE_LIMIT } from '@union/core/repository-blob';

import type {
  RepositoryBlob,
  RepositoryCommit,
  RepositoryEntry,
  RepositoryTree,
} from '../../src/repository-api-types';
import { request } from './api';

function base(projectId: number): string {
  return `/api/projects/${projectId}/repository`;
}

/** The commit `ref` names now (the base branch when null); Refresh reads it again. */
export function useRepositoryCommit(
  projectId: number,
  ref: string | null,
): UseQueryResult<RepositoryCommit> {
  const query = ref === null ? '' : `?ref=${encodeURIComponent(ref)}`;
  return useQuery({
    queryKey: ['repository', projectId, 'commit', ref],
    queryFn: (): Promise<RepositoryCommit> => request('GET', `${base(projectId)}/commit${query}`),
    retry: false,
  });
}

/** The whole tree under the commit's root folder (only the root level when GitHub truncated it). */
export function useRepositoryTree(
  projectId: number,
  treeSha: string | undefined,
): UseQueryResult<RepositoryTree> {
  return useQuery({
    queryKey: ['repository', projectId, 'tree', treeSha],
    queryFn: (): Promise<RepositoryTree> =>
      request('GET', `${base(projectId)}/tree?sha=${treeSha ?? ''}`),
    enabled: treeSha !== undefined,
    staleTime: Infinity,
  });
}

/** One folder's own entries, for a truncated tree. */
export function readFolder(projectId: number, folder: RepositoryEntry): Promise<RepositoryTree> {
  const prefix = encodeURIComponent(folder.path);
  return request('GET', `${base(projectId)}/tree?sha=${folder.sha}&prefix=${prefix}`);
}

/** Branches change as people push: read again after a minute. */
const BRANCHES_STALE_MS = 60_000;

/** The repository's branches, read once the picker opens. */
export function useRepositoryBranches(
  projectId: number,
  enabled: boolean,
): UseQueryResult<string[]> {
  return useQuery({
    queryKey: ['repository', projectId, 'branches'],
    queryFn: (): Promise<{ branches: string[] }> => request('GET', `${base(projectId)}/branches`),
    select: (data) => data.branches,
    enabled,
    staleTime: BRANCHES_STALE_MS,
  });
}

/** Whether the tab reads the file at all: larger ones only show their size. */
export function readable(entry: RepositoryEntry): boolean {
  return entry.type === 'file' && (entry.size ?? 0) <= REPOSITORY_FILE_LIMIT;
}

/** The file's content, as text, an image, or only its size. */
export function useRepositoryBlob(
  projectId: number,
  entry: RepositoryEntry | null,
): UseQueryResult<RepositoryBlob> {
  const path = encodeURIComponent(entry?.path ?? '');
  return useQuery({
    queryKey: ['repository', projectId, 'blob', entry?.sha],
    queryFn: (): Promise<RepositoryBlob> =>
      request(
        'GET',
        `${base(projectId)}/blob?sha=${entry?.sha ?? ''}&path=${path}&size=${entry?.size ?? ''}`,
      ),
    enabled: entry !== null && readable(entry),
    staleTime: Infinity,
  });
}
