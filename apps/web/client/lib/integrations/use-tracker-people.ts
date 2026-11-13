// The people a comment on a ticket's tracker item can tag whose name starts with what is typed after `@`.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { IntegrationKindName } from '@union/core/integration-kinds';
import type { TrackerPerson } from '@union/core/tracker-mention';
import { useEffect, useState } from 'react';

import { request } from '../app/api';

/** The tracker is asked once typing pauses this long, not on each key. */
const PAUSE_MS = 250;
/** People change rarely: a name read is kept for the time a comment is written. */
const STALE_MS = 300_000;

/** Where the people come from: a ticket's item in one tracker. */
export type MentionTarget = { ticketId: number; kind: IntegrationKindName };

/** The people matching `query`, read once typing pauses; none when `query` is null (no `@` at the caret). */
export function useTrackerPeople(
  { ticketId, kind }: MentionTarget,
  query: string | null,
): { people: TrackerPerson[]; error: Error | null } {
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(query);
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);
  const { data, error } = useQuery({
    queryKey: ['tracker-people', ticketId, kind, settled],
    queryFn: () =>
      request<TrackerPerson[]>(
        'GET',
        `/api/tickets/${ticketId}/trackers/${kind}/comments/people?q=${encodeURIComponent(settled ?? '')}`,
      ),
    enabled: query !== null && settled !== null,
    staleTime: STALE_MS,
    retry: false,
    placeholderData: keepPreviousData,
  });
  return { people: query === null ? [] : (data ?? []), error };
}
