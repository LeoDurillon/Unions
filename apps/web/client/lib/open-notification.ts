// Opens what a notification is about (its ticket or investigation, in its project) and marks it read.

import { useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@union/core';
import { useCallback } from 'react';

import { notificationsApi } from './notifications-api';
import { openInvestigation } from './opened-investigation';
import { NOTIFICATIONS_KEY } from './use-notifications';

/**
 * What opening a notification needs to know about it; `alsoRead`: the other unread notifications
 * about the same ticket or investigation, marked read with it.
 */
export type NotificationTarget = Pick<
  Notification,
  'id' | 'projectId' | 'ticketId' | 'investigationId'
> & { alsoRead?: number[] };

/**
 * The handler that opens a notification: its project's board, then its ticket's panel or its
 * investigation. Nothing happens when the user keeps unsaved settings (`leave` says no).
 */
export function useNotificationOpener({
  leave,
  selectProject,
  showBoard,
  openTicket,
}: {
  leave: () => boolean;
  selectProject: (id: number) => void;
  showBoard: () => void;
  openTicket: (id: number) => void;
}): (target: NotificationTarget) => void {
  const queryClient = useQueryClient();
  const markRead = useCallback(
    async (ids: number[]): Promise<void> => {
      try {
        await Promise.all(ids.map((id) => notificationsApi.markRead(id)));
      } catch {
        // It stays unread, as the panel shows: opening what it is about matters more.
      }
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
    [queryClient],
  );
  return useCallback(
    (target: NotificationTarget): void => {
      if (!leave()) {
        return;
      }
      void markRead([target.id, ...(target.alsoRead ?? [])]);
      selectProject(target.projectId);
      showBoard();
      if (target.investigationId !== null) {
        openInvestigation(target.investigationId);
      } else if (target.ticketId !== null) {
        openTicket(target.ticketId);
      }
    },
    [leave, selectProject, showBoard, openTicket, markRead],
  );
}
