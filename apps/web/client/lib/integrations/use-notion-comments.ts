// The open discussions of a ticket's Notion page and the comments sent to it. The discussions are
// read from Notion once per opening of its tab.

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { NotionTabView } from '../../../src/notion-discussion-types';
import { request } from '../app/api';
import { useEvents } from '../app/use-event-stream';

/** A comment Notion refused: why, and its text for the box. */
type NotionCommentFailure = { error: string; text: string };

/** Where a failure belongs: its discussion, or `page` for a new comment. */
export function replyKey(discussionId: string | null): string {
  return discussionId ?? 'page';
}

/** The tab's view in the query cache: changes to its page update it. */
export function notionCommentsKey(ticketId: number): unknown[] {
  return ['notion-comments', ticketId];
}

function url(ticketId: number): string {
  return `/api/tickets/${ticketId}/notion-comments`;
}

/** `refetch` is the tab's Refresh. */
export function useNotionComments(ticketId: number): UseQueryResult<NotionTabView> {
  return useQuery({
    queryKey: notionCommentsKey(ticketId),
    queryFn: () => request<NotionTabView>('GET', url(ticketId)),
    staleTime: Infinity,
    retry: false,
  });
}

/** How many discussions the tab found, once it has been read; null before (never read from here). */
export function useNotionDiscussionCount(ticketId: number): number | null {
  const { data } = useQuery<NotionTabView>({
    queryKey: notionCommentsKey(ticketId),
    enabled: false,
    staleTime: Infinity,
  });
  return data ? data.discussions.length : null;
}

function failureOf(payload: unknown): ({ key: string } & NotionCommentFailure) | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const discussionId = 'discussionId' in payload ? payload.discussionId : null;
  const error = 'error' in payload ? payload.error : null;
  const text = 'text' in payload ? payload.text : null;
  if (typeof error !== 'string' || typeof text !== 'string') {
    return null;
  }
  return { key: replyKey(typeof discussionId === 'string' ? discussionId : null), error, text };
}

export type NotionCommentSend = {
  /** Queues the comment; resolves once queued, the box closes then and shows it "Sending…". */
  send: (discussionId: string | null, text: string) => Promise<void>;
  failures: ReadonlyMap<string, NotionCommentFailure>;
  dismiss: (key: string) => void;
};

/**
 * Sends comments to the ticket's page through the worker. Its posted or failed event reads the
 * discussions again; a failure is kept, by discussion, so its box opens with the text.
 */
export function useNotionCommentSend(ticketId: number): NotionCommentSend {
  const client = useQueryClient();
  const [failures, setFailures] = useState<ReadonlyMap<string, NotionCommentFailure>>(new Map());
  const dismiss = (failed: string): void => {
    setFailures((old) => new Map([...old].filter(([one]) => one !== failed)));
  };
  useEvents((event) => {
    if (event.ticketId !== ticketId || !event.type.startsWith('notion_comment_')) {
      return;
    }
    const failure = event.type === 'notion_comment_failed' ? failureOf(event.payload) : null;
    if (failure) {
      setFailures((old) => new Map(old).set(failure.key, failure));
    }
    void client.invalidateQueries({ queryKey: notionCommentsKey(ticketId) });
  });
  return {
    send: async (discussionId, text) => {
      const { id } = await request<{ id: number }>('POST', url(ticketId), { discussionId, text });
      dismiss(replyKey(discussionId));
      client.setQueryData<NotionTabView>(notionCommentsKey(ticketId), (old) =>
        old
          ? {
              ...old,
              pending: [
                ...old.pending,
                { commandId: id, discussionId, text: text.trim(), createdAt: Date.now() },
              ],
            }
          : old,
      );
    },
    failures,
    dismiss,
  };
}
