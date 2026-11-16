// The review's Explain conversations, polled while a turn waits or runs, with asking and cancelling.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type {
  ConversationView,
  ExplanationView,
} from '../../../src/routes/review/explanation-views';
import type { ExplanationLogView } from '../../../src/routes/review/review-explanations';
import { explanationApi, type ExplanationAsk } from './explanation-api';
import { reviewBase, type ReviewTarget } from './review-target';

/** Live events refresh it as the run moves; this slow poll only covers a live stream that is down. */
const SAFETY_POLL_MS = 30_000;
/** An explanation's agent output is not on the live stream: its log is polled while it runs. */
const LOG_POLL_MS = 3000;

function isExplaining(explanation: ExplanationView): boolean {
  return explanation.status === 'queued' || explanation.status === 'running';
}

/** The conversations whose last turn waits for or gets its answer. */
export function explainingCount(conversations: ConversationView[]): number {
  return conversations.filter((conversation) => {
    const last = conversation.turns.at(-1);
    return last !== undefined && isExplaining(last);
  }).length;
}

export function useExplanations(target: ReviewTarget): {
  explanations: UseQueryResult<ConversationView[]>;
  ask: ReturnType<typeof useMutation<ExplanationView, Error, ExplanationAsk>>;
  cancel: ReturnType<typeof useMutation<ExplanationView, Error, number>>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  const queryKey = ['review', base, 'explanations'];
  const explanations = useQuery({
    queryKey,
    queryFn: () => explanationApi.list(base),
    refetchInterval: (query) =>
      explainingCount(query.state.data ?? []) > 0 ? SAFETY_POLL_MS : false,
  });
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey });
  return {
    explanations,
    ask: useMutation({
      mutationFn: (ask: ExplanationAsk) => explanationApi.start(base, ask),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (id: number) => explanationApi.cancel(base, id),
      onSuccess: refresh,
    }),
  };
}

/** What the agent printed so far, polled while it runs. */
export function useExplanationLog(
  target: ReviewTarget,
  id: number,
  running: boolean,
): UseQueryResult<ExplanationLogView> {
  const base = reviewBase(target);
  return useQuery({
    queryKey: ['review', base, 'explanations', id, 'log'],
    queryFn: () => explanationApi.log(base, id),
    enabled: running,
    refetchInterval: running ? LOG_POLL_MS : false,
  });
}
