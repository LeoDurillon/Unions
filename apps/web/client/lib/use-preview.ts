// A ticket's or a pull request's preview as its section reads it, and the commands that act on it.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { PreviewView } from '../../src/api-types';
import { previewCalls, previewKey, previewPoll, type PreviewTarget } from './preview-target';

export type PreviewCalls = ReturnType<typeof previewCalls>;

/** The preview (polled for a pull request while something is on its way), and `act` to run a call. */
export function usePreview(target: PreviewTarget): {
  query: UseQueryResult<PreviewView>;
  calls: PreviewCalls;
  act: (call: () => Promise<PreviewView>) => void;
  busy: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const queryKey = previewKey(target);
  const calls = previewCalls(target);
  const query = useQuery({
    queryKey,
    queryFn: calls.get,
    refetchInterval: (current) => previewPoll(target, current.state.data),
  });
  const mutation = useMutation({
    mutationFn: (call: () => Promise<PreviewView>) => call(),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
    },
  });
  return {
    query,
    calls,
    act: (call) => {
      mutation.mutate(call);
    },
    busy: mutation.isPending,
    error: query.error ?? mutation.error,
  };
}
