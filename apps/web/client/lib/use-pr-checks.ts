// The pull request's CI checks (read again every 30 s while some still run), and giving picks of them to the implementer.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { CiGivenView, CiPick, CiPreview, PrChecksView } from '../../src/ci-api-types';
import { request } from './api';

const PENDING_POLL_MS = 30_000;

type Mutation<T, I> = ReturnType<typeof useMutation<T, Error, I>>;

export type SendInput = { picks: CiPick[]; note: string };

export function usePrChecks(ticketId: number): {
  checks: UseQueryResult<PrChecksView>;
  preview: Mutation<CiPreview, CiPick[]>;
  keep: Mutation<CiGivenView, CiPick[]>;
  send: Mutation<CiGivenView, SendInput>;
  drop: Mutation<CiGivenView, number>;
} {
  const queryClient = useQueryClient();
  const key = ['ticket', ticketId, 'pr-checks'];
  const path = `/api/tickets/${ticketId}/pr-checks`;
  const checks = useQuery({
    queryKey: key,
    queryFn: (): Promise<PrChecksView> => request('GET', path),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.checks.some((check) => check.state === 'pending') === true
        ? PENDING_POLL_MS
        : false,
  });
  const given = (data: CiGivenView): void => {
    queryClient.setQueryData<PrChecksView>(key, (old) => (old ? { ...old, ...data } : old));
  };
  const preview = useMutation({
    mutationFn: (picks: CiPick[]): Promise<CiPreview> =>
      request('POST', `${path}/preview`, { picks }),
  });
  const keep = useMutation({
    mutationFn: (picks: CiPick[]): Promise<CiGivenView> =>
      request('POST', `${path}/keep`, { picks }),
    onSuccess: given,
  });
  // The revision moves the ticket: its panel reads it again.
  const send = useMutation({
    mutationFn: (input: SendInput): Promise<CiGivenView> => request('POST', `${path}/send`, input),
    onSuccess: given,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
  });
  const drop = useMutation({
    mutationFn: (id: number): Promise<CiGivenView> => request('POST', `${path}/given/${id}/drop`),
    onSuccess: given,
  });
  return { checks, preview, keep, send, drop };
}
