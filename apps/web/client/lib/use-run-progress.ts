// The project's runs in progress: when each started and what its agent did last. They are polled
// while the board shows a running ticket. Agent output is not on the shared stream, so this is read
// on a timer.
import { useQuery } from '@tanstack/react-query';
import type { RunProgress } from '@union/core';

import { request } from './api';

/** Often enough for the latest tool call to feel live, rarely enough to cost nothing. */
const POLL_MS = 3000;

/**
 * The ticket's run in progress, if any. Every running card asks the same query, so the board reads
 * it once per poll; under the `tickets` key, so a run starting or ending refreshes it at once.
 */
export function useRunProgress(projectId: number, ticketId: number): RunProgress | undefined {
  const query = useQuery({
    queryKey: ['tickets', projectId, 'run-progress'],
    queryFn: (): Promise<RunProgress[]> =>
      request('GET', `/api/projects/${projectId}/run-progress`),
    refetchInterval: POLL_MS,
  });
  return query.data?.find((progress) => progress.ticketId === ticketId);
}
