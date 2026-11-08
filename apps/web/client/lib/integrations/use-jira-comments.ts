// The comments of a ticket's Jira issue, read from Jira once per opening of its tab, and the comments sent to it.

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { JiraReplyTo } from '@union/core/jira-comment-post';
import { useState } from 'react';

import type { JiraTabView } from '../../../src/jira-comment-types';
import { request } from '../api';
import { useEvents } from '../use-event-stream';

/** A comment Jira refused: why, and its text for the box. */
type JiraCommentFailure = { error: string; text: string };

/** Where a box belongs: the comment it replies to, or `issue` for a new comment. */
export function jiraReplyKey(replyTo: string | null): string {
  return replyTo ?? 'issue';
}

function key(ticketId: number): unknown[] {
  return ['jira-comments', ticketId];
}

function url(ticketId: number): string {
  return `/api/tickets/${ticketId}/jira-comments`;
}

/** `refetch` is the tab's Refresh. */
export function useJiraComments(ticketId: number): UseQueryResult<JiraTabView> {
  return useQuery({
    queryKey: key(ticketId),
    queryFn: () => request<JiraTabView>('GET', url(ticketId)),
    staleTime: Infinity,
    retry: false,
  });
}

function failureOf(payload: unknown): ({ key: string } & JiraCommentFailure) | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const replyTo = 'replyTo' in payload ? payload.replyTo : null;
  const error = 'error' in payload ? payload.error : null;
  const text = 'text' in payload ? payload.text : null;
  if (typeof error !== 'string' || typeof text !== 'string') {
    return null;
  }
  return { key: jiraReplyKey(typeof replyTo === 'string' ? replyTo : null), error, text };
}

export type JiraCommentSend = {
  /** Queues the comment; resolves once queued, the box closes then and shows it "Sending…". */
  send: (replyTo: JiraReplyTo | null, text: string) => Promise<void>;
  failures: ReadonlyMap<string, JiraCommentFailure>;
  dismiss: (key: string) => void;
};

/**
 * Sends comments to the ticket's issue through the worker. Its posted or failed event reads the
 * comments again; a failure is kept, by box, so it opens with the text.
 */
export function useJiraCommentSend(ticketId: number): JiraCommentSend {
  const client = useQueryClient();
  const [failures, setFailures] = useState<ReadonlyMap<string, JiraCommentFailure>>(new Map());
  const dismiss = (failed: string): void => {
    setFailures((old) => new Map([...old].filter(([one]) => one !== failed)));
  };
  useEvents((event) => {
    if (event.ticketId !== ticketId || !event.type.startsWith('jira_comment_')) {
      return;
    }
    const failure = event.type === 'jira_comment_failed' ? failureOf(event.payload) : null;
    if (failure) {
      setFailures((old) => new Map(old).set(failure.key, failure));
    }
    void client.invalidateQueries({ queryKey: key(ticketId) });
  });
  return {
    send: async (replyTo, text) => {
      const { id } = await request<{ id: number }>('POST', url(ticketId), { replyTo, text });
      const replyKey = replyTo?.commentId ?? null;
      dismiss(jiraReplyKey(replyKey));
      client.setQueryData<JiraTabView>(key(ticketId), (old) =>
        old
          ? {
              ...old,
              pending: [
                ...old.pending,
                { commandId: id, replyTo: replyKey, text: text.trim(), createdAt: Date.now() },
              ],
            }
          : old,
      );
    },
    failures,
    dismiss,
  };
}
