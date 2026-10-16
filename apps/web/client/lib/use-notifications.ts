// The notifications, page by page, with the unread count (also in the tab's title) and marking them read.
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@union/core';
import { useEffect } from 'react';

import { notificationsApi } from './notifications-api';

export const NOTIFICATIONS_KEY = ['notifications'];

/** The server's page size: a shorter page is the last one. */
const PAGE = 30;

/** The tab's own title, before the unread count is put in front of it. */
const BASE_TITLE = globalThis.document.title;

export type Notifications = {
  items: Notification[];
  unread: number;
  error: Error | null;
  hasOlder: boolean;
  loadOlder: () => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
};

export function useNotifications(): Notifications {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ pageParam }) => notificationsApi.page(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.items.length < PAGE ? null : (last.items.at(-1)?.id ?? null)),
  });
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  const read = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refresh });
  const readAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refresh });
  const pages = query.data?.pages ?? [];
  const unread = pages[0]?.unread ?? 0;
  useEffect(() => {
    globalThis.document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unread]);
  return {
    items: pages.flatMap((page) => page.items),
    unread,
    error: query.error ?? read.error ?? readAll.error,
    hasOlder: query.hasNextPage,
    loadOlder: () => {
      void query.fetchNextPage();
    },
    markRead: (id) => {
      read.mutate(id);
    },
    markAllRead: () => {
      readAll.mutate();
    },
  };
}
