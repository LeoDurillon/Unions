// Union's own update: the worker's last check (read again every few seconds), checking again, updating, and reloading the page on the new commit.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

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
function useCheckForUpdate(): Mutation<void> {
  return useUnionUpdateCommand(() => request('POST', '/api/union-update/check'));
}

/** The worker's fetch times out after a minute; past this, the button gives up waiting. */
const CHECK_WAIT_MS = 70_000;
/** Read the state often while a check runs, so the button settles soon after it. */
const CHECKING_POLL_MS = 1000;

function noCleanup(): void {
  // Nothing was started.
}

/**
 * Check now, and whether that check still runs: the request only queues it, so it runs until the
 * worker records a check newer than the click (or the wait runs out).
 */
export function useCheckNow(checkedAt: number | null): { checking: boolean; start: () => void } {
  const queryClient = useQueryClient();
  const check = useCheckForUpdate();
  const [since, setSince] = useState<number | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const waiting = since !== null && !gaveUp && (checkedAt === null || checkedAt < since);
  useEffect(() => {
    if (!waiting) {
      return noCleanup;
    }
    const poll = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: KEY });
    }, CHECKING_POLL_MS);
    const giveUp = setTimeout(() => {
      setGaveUp(true);
    }, CHECK_WAIT_MS);
    return (): void => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [waiting, queryClient]);
  return {
    checking: waiting || check.isPending,
    start: () => {
      setGaveUp(false);
      setSince(Date.now());
      check.mutate();
    },
  };
}

/** Asks the worker to update; `force` even while work is in progress. */
export function useStartUpdate(): Mutation<boolean> {
  return useUnionUpdateCommand((force) => request('POST', '/api/union-update', { force }));
}
