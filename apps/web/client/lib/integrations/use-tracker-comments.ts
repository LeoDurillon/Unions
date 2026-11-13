// The comments of a ticket's tracker item, read from the tracker once per opening of its tab, and the comments sent.

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { IntegrationKindName } from '@union/core/integration-kinds';
import { useState } from 'react';

import type { TrackerCommentsView } from '../../../src/tracker-comment-types';
import { request } from '../app/api';
import { useEvents } from '../app/use-event-stream';

/** A comment the tracker refused: why, and its text for the box. */
type CommentFailure = { error: string; text: string };

/** Who a reply mentions first, where replies are new comments (Jira). */
type Mention = { accountId: string; name: string };

/** Where a box belongs: the thread it replies in, or `item` for a new comment. */
export function boxKey(threadId: string | null): string {
  return threadId ?? 'item';
}

/** The tab's comments in the query cache: Add to review and sending update it. */
export function trackerCommentsKey(ticketId: number, kind: IntegrationKindName): unknown[] {
  return ['tracker-comments', ticketId, kind];
}

function url(ticketId: number, kind: IntegrationKindName): string {
  return `/api/tickets/${ticketId}/trackers/${kind}/comments`;
}

/** `refetch` is part of the tab's Refresh. */
export function useTrackerComments(
  ticketId: number,
  kind: IntegrationKindName,
): UseQueryResult<TrackerCommentsView> {
  return useQuery({
    queryKey: trackerCommentsKey(ticketId, kind),
    queryFn: () => request<TrackerCommentsView>('GET', url(ticketId, kind)),
    staleTime: Infinity,
    retry: false,
  });
}

/** The comments once the tab has read them; null before (the tracker is never called from here). */
export function useTrackerCommentsRead(
  ticketId: number,
  kind: IntegrationKindName,
): TrackerCommentsView | null {
  const { data } = useQuery<TrackerCommentsView>({
    queryKey: trackerCommentsKey(ticketId, kind),
    enabled: false,
    staleTime: Infinity,
  });
  return data ?? null;
}

function failureOf(payload: unknown): ({ key: string } & CommentFailure) | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const threadId = 'threadId' in payload ? payload.threadId : null;
  const error = 'error' in payload ? payload.error : null;
  const text = 'text' in payload ? payload.text : null;
  if (typeof error !== 'string' || typeof text !== 'string') {
    return null;
  }
  return { key: boxKey(typeof threadId === 'string' ? threadId : null), error, text };
}

export type TrackerCommentSend = {
  /** The ticket and tracker the comments go to. */
  target: { ticketId: number; kind: IntegrationKindName };
  /** Queues the comment; resolves once queued, the box closes then and shows it "Sending…". */
  send: (threadId: string | null, mention: Mention | null, text: string) => Promise<void>;
  failures: ReadonlyMap<string, CommentFailure>;
  dismiss: (key: string) => void;
};

/**
 * Sends comments to the ticket's item through the worker. Its posted or failed event reads the
 * comments again; a failure is kept, by box, so it opens with the text.
 */
export function useTrackerCommentSend(
  ticketId: number,
  kind: IntegrationKindName,
): TrackerCommentSend {
  const client = useQueryClient();
  const queryKey = trackerCommentsKey(ticketId, kind);
  const [failures, setFailures] = useState<ReadonlyMap<string, CommentFailure>>(new Map());
  const dismiss = (failed: string): void => {
    setFailures((old) => new Map([...old].filter(([one]) => one !== failed)));
  };
  useEvents((event) => {
    if (event.ticketId !== ticketId || !event.type.startsWith('tracker_comment_')) {
      return;
    }
    const failure = event.type === 'tracker_comment_failed' ? failureOf(event.payload) : null;
    if (failure) {
      setFailures((old) => new Map(old).set(failure.key, failure));
    }
    void client.invalidateQueries({ queryKey });
  });
  return {
    target: { ticketId, kind },
    send: async (threadId, mention, text) => {
      const body = { threadId, mention, text };
      const { id } = await request<{ id: number }>('POST', url(ticketId, kind), body);
      dismiss(boxKey(threadId));
      const sent = { commandId: id, threadId, text: text.trim(), createdAt: Date.now() };
      client.setQueryData<TrackerCommentsView>(queryKey, (old) =>
        old ? { ...old, pending: [...old.pending, sent] } : old,
      );
    },
    failures,
    dismiss,
  };
}
