// The replies of one pull request (pending, suggested, who posts) and their mutations; the discussion is read again once GitHub has a reply.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { PendingReply, RepliesResponse, SuggestedReply } from '../../src/reply-api-types';
import { request } from './api';
import { useEvents } from './use-event-stream';

export type ReplyTarget = PendingReply['target'];
type ReplyFailure = { error: string; body: string };

/** Where the replies live: a ticket's (with `?pr=`), or a current review's. */
export function ticketRepliesBase(ticketId: number): string {
  return `/api/tickets/${ticketId}/pr-replies`;
}

export function reviewRepliesBase(reviewBase: string): string {
  return `${reviewBase}/replies`;
}

/** One key per thread or note, to find its pending reply, suggestion or failure. */
export function targetKey(target: ReplyTarget): string {
  return target.kind === 'thread' ? `thread:${target.threadId}` : `note:${target.url}`;
}

const REPLY_EVENTS = new Set([
  'pr_comment_replied',
  'pr_comment_reply_failed',
  'pr_replies_suggested',
]);

function numberOf(payload: unknown): number | null {
  return typeof payload === 'object' && payload !== null && 'number' in payload
    ? Number(payload.number)
    : null;
}

/** A failed reply's command and what GitHub said; null for another event. */
function failureOf(type: string, payload: unknown): ({ commandId: number } & ReplyFailure) | null {
  if (type !== 'pr_comment_reply_failed' || typeof payload !== 'object' || payload === null) {
    return null;
  }
  const commandId = 'commandId' in payload ? payload.commandId : null;
  const error = 'error' in payload ? payload.error : null;
  const body = 'body' in payload ? payload.body : null;
  return typeof commandId === 'number' && typeof error === 'string' && typeof body === 'string'
    ? { commandId, error, body }
    : null;
}

export type PrReplies = {
  query: UseQueryResult<RepliesResponse>;
  /** Posts a reply; resolves once queued, the box closes then. */
  send: (target: ReplyTarget, body: string, resolve: boolean) => Promise<void>;
  /** The last failure of a reply sent from this page, by `targetKey`. */
  failures: ReadonlyMap<string, ReplyFailure>;
  /** Forgets a failure: its box was closed. */
  dismiss: (target: ReplyTarget) => void;
  pendingFor: (target: ReplyTarget) => PendingReply[];
  suggestionFor: (githubUrl: string | undefined) => SuggestedReply | undefined;
  edit: (commentId: number, change: { body?: string; resolve?: boolean }) => Promise<void>;
  sendSuggestion: (commentId: number) => void;
  sendAll: () => void;
  discard: (commentId: number) => void;
  busy: boolean;
  error: Error | null;
};

function useReplyFailures(
  number: number,
  onEvent: (posted: boolean) => void,
): {
  failures: ReadonlyMap<string, ReplyFailure>;
  remember: (commandId: number, target: ReplyTarget) => void;
  clear: (target: ReplyTarget) => void;
} {
  const [sent, setSent] = useState<ReadonlyMap<number, string>>(new Map());
  const [failures, setFailures] = useState<ReadonlyMap<string, ReplyFailure>>(new Map());
  useEvents((event) => {
    if (!REPLY_EVENTS.has(event.type) || numberOf(event.payload) !== number) {
      return;
    }
    const failure = failureOf(event.type, event.payload);
    const key = failure ? sent.get(failure.commandId) : undefined;
    if (failure && key !== undefined) {
      setFailures((old) => new Map(old).set(key, { error: failure.error, body: failure.body }));
    }
    onEvent(event.type === 'pr_comment_replied');
  });
  return {
    failures,
    remember: (commandId, target) => {
      setSent((old) => new Map(old).set(commandId, targetKey(target)));
    },
    clear: (target) => {
      setFailures((old) => new Map([...old].filter(([key]) => key !== targetKey(target))));
    },
  };
}

type SuggestionActions = Pick<PrReplies, 'edit' | 'sendSuggestion' | 'sendAll' | 'discard'> & {
  isPending: boolean;
  error: Error | null;
};

/** Edit, send (one or all) and discard the implementer's suggestions. */
function useSuggestionActions(base: string, query: string, refresh: () => void): SuggestionActions {
  const act = useMutation({
    mutationFn: (input: { method: string; path: string; body?: unknown }) =>
      request<unknown>(input.method, `${base}/suggestions${input.path}${query}`, input.body),
    onSettled: refresh,
  });
  return {
    edit: async (commentId, change) => {
      await act.mutateAsync({ method: 'PATCH', path: `/${commentId}`, body: change });
    },
    sendSuggestion: (commentId) => {
      act.mutate({ method: 'POST', path: `/${commentId}/send` });
    },
    sendAll: () => {
      act.mutate({ method: 'POST', path: '/send' });
    },
    discard: (commentId) => {
      act.mutate({ method: 'POST', path: `/${commentId}/discard` });
    },
    isPending: act.isPending,
    error: act.error,
  };
}

/**
 * The replies of pull request `number` at `base` (`?pr=` for a ticket's slice). Each reply event
 * reads them again; a posted reply also calls `onPosted`, to read the discussion from GitHub.
 */
export function usePrReplies(
  base: string,
  number: number,
  onPosted: () => unknown,
  query = '',
): PrReplies {
  const client = useQueryClient();
  const key = ['pr-replies', base, number];
  const replies = useQuery({
    queryKey: key,
    queryFn: () => request<RepliesResponse>('GET', `${base}${query}`),
    retry: false,
  });
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: key });
  };
  const failures = useReplyFailures(number, (posted) => {
    refresh();
    if (posted) {
      void onPosted();
    }
  });
  const post = useMutation({
    mutationFn: (input: { target: ReplyTarget; body: string; resolve: boolean }) =>
      request<{ id: number }>('POST', `${base}${query}`, input),
    onSuccess: (command, input) => {
      failures.remember(command.id, input.target);
      failures.clear(input.target);
      refresh();
    },
  });
  const { isPending, error, ...actions } = useSuggestionActions(base, query, refresh);
  const { data } = replies;
  return {
    query: replies,
    send: async (target, body, resolve) => {
      await post.mutateAsync({ target, body, resolve });
    },
    failures: failures.failures,
    dismiss: failures.clear,
    pendingFor: (target) =>
      (data?.pending ?? []).filter((reply) => targetKey(reply.target) === targetKey(target)),
    suggestionFor: (githubUrl) => data?.suggested.find((one) => one.githubUrl === githubUrl),
    ...actions,
    busy: post.isPending || isPending,
    error: post.error ?? error,
  };
}
