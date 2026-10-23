// The change's commits, oldest first, and (tickets) the change since the last review.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { sliceRef, type CommitDiffResponse, type CommitsResponse } from '../../src/api-types';
import { request } from './api';

/** The commits are read from GitHub: kept this long before asking again. */
const COMMITS_STALE_MS = 300_000;

/** `base` is the review's API root (`reviewBase`). */
const commitsApi = {
  list: (base: string): Promise<CommitsResponse> => request('GET', `${base}/commits`),
  diff: (base: string, sha: string): Promise<CommitDiffResponse> =>
    request('GET', `${base}/commits/${sha}/diff`),
  file: (
    base: string,
    sha: string,
    fileId: number,
  ): Promise<{ id: number; path: string; patch: string }> =>
    request('GET', `${base}/commits/${sha}/files/${fileId}`),
};

/** The change's commits, oldest first, and (tickets) the change since the last review. */
export function useCommits(base: string): UseQueryResult<CommitsResponse> {
  return useQuery({
    queryKey: ['review', base, 'commits'],
    queryFn: () => commitsApi.list(base),
    staleTime: COMMITS_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** One commit's files (or the change since the last review): a ticket's new diff refreshes them. */
export function useCommitDiff(base: string, sha: string): UseQueryResult<CommitDiffResponse> {
  return useQuery({
    queryKey: ['review', base, 'commit', sha],
    queryFn: () => commitsApi.diff(base, sha),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** A split ticket's slice's own files, when one is picked. */
export function useSliceDiff(
  base: string,
  slice: number | null,
): UseQueryResult<CommitDiffResponse> {
  return useQuery({
    queryKey: ['review', base, 'commit', sliceRef(slice ?? 0)],
    queryFn: () => commitsApi.diff(base, sliceRef(slice ?? 0)),
    enabled: slice !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function useCommitFile(
  base: string,
  sha: string,
  fileId: number,
): UseQueryResult<{ id: number; path: string; patch: string }> {
  return useQuery({
    queryKey: ['review', base, 'commit', sha, 'file', fileId],
    queryFn: () => commitsApi.file(base, sha, fileId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
