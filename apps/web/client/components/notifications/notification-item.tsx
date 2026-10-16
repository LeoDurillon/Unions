// One notification in the panel: what it is about, what happened, where and when; unread ones stand out.
import type { Notification } from '@union/core';
import type { ReactElement } from 'react';

import { Badge } from '../ui';
import { KIND_LABELS } from './notification-labels';

const TIME = { dateStyle: 'short', timeStyle: 'short' } as const;

export function NotificationItem({
  notification,
  project,
  onOpen,
}: {
  notification: Notification;
  /** `owner/repo`, when the project is still there. */
  project: string | null;
  onOpen: (notification: Notification) => void;
}): ReactElement {
  const unread = notification.readAt === null;
  const kind = KIND_LABELS[notification.kind];
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onOpen(notification);
        }}
        className="flex w-full gap-2 rounded-md px-2 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
      >
        <span
          aria-label={unread ? 'Unread' : undefined}
          className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? 'bg-indigo-500' : 'bg-transparent'}`}
        />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-2">
            <span
              className={`truncate text-sm ${unread ? 'font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              {notification.title}
            </span>
            <span className="ml-auto shrink-0">
              <Badge tone={kind.tone}>{kind.label}</Badge>
            </span>
          </span>
          <span className="line-clamp-2 block text-xs text-zinc-600 dark:text-zinc-400">
            {notification.detail}
          </span>
          <span className="block text-xs text-zinc-500">
            {project ?? 'Removed project'} ·{' '}
            {new Date(notification.createdAt).toLocaleString(undefined, TIME)}
          </span>
        </span>
      </button>
    </li>
  );
}
