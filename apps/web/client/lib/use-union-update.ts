// Union's own update: the worker's last check (read again every few seconds), checking again, updating, and reloading the page on the new commit.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { UnionUpdateView } from '../../src/union-update-types';
import { request } from './api';

const KEY = ['union-update'];
const POLL_MS = 5000;

/**
 * The state, and a reload once Union runs another commit than the page was loaded on. Only once the
 * update is over: the new commit is checked out before web and worker restart, and a reload then
 * would hit the web as it goes down.
 */
export function useUnionUpdate(): UseQueryResult<UnionUpdateView> {
  const query = useQuery({
    queryKey: KEY,
    queryFn: (): Promise<UnionUpdateView> => request('GET', '/api/union-update'),
    refetchInterval: POLL_MS,
  });
  const loadedOn = useRef<string | null>(null);
  const sha = query.data?.update?.localSha ?? null;
  const settled = query.data?.update?.status === 'idle';
  useEffect(() => {
    if (sha === null) {
      return;
    }
    loadedOn.current ??= sha;
    if (settled && loadedOn.current !== sha) {
      globalThis.location.reload();
    }
  }, [sha, settled]);
  return query;
}

type Mutation<V> = ReturnType<typeof useMutation<UnionUpdateView, Error, V>>;

function useUnionUpdateCommand<V>(send: (value: V) => Promise<UnionUpdateView>): Mutation<V> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (view) => {
      queryClient.setQueryData(KEY, view);
    },
  });
}

/** Asks the worker to fetch the remote again. */
export function useCheckForUpdate(): Mutation<void> {
  return useUnionUpdateCommand(() => request('POST', '/api/union-update/check'));
}

/** Asks the worker to update; `force` even while work is in progress. */
export function useStartUpdate(): Mutation<boolean> {
  return useUnionUpdateCommand((force) => request('POST', '/api/union-update', { force }));
}
