// The notifications, page by page, with how many are unread and how many still ask something (also in the tab's
// title), marking them read and clearing them.
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { NotificationView } from '../../src/routes/notifications';
import { NOTIFICATIONS_KEY, notificationsApi } from './notifications-api';

/** The server's page size: a shorter page is the last one. */
const PAGE = 30;

/** The tab's own title, before the unread count is put in front of it. */
const BASE_TITLE = globalThis.document.title;

export type Notifications = {
  items: NotificationView[];
  unread: number;
  /** Unread, and still asking something of the user: what the bell counts. */
  toAct: number;
  error: Error | null;
  hasOlder: boolean;
  loadOlder: () => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  clearAll: () => void;
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
  const clear = useMutation({ mutationFn: notificationsApi.clearAll, onSuccess: refresh });
  const pages = query.data?.pages ?? [];
  const unread = pages[0]?.unread ?? 0;
  const toAct = pages[0]?.toAct ?? 0;
  useEffect(() => {
    globalThis.document.title = toAct > 0 ? `(${toAct}) ${BASE_TITLE}` : BASE_TITLE;
  }, [toAct]);
  return {
    items: pages.flatMap((page) => page.items),
    unread,
    toAct,
    error: query.error ?? read.error ?? readAll.error ?? clear.error,
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
    clearAll: () => {
      clear.mutate();
    },
  };
}
