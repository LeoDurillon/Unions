// The notifications grouped by what they are about (a ticket or an investigation), newest group first.
import type { Notification } from '@union/core';

/** One ticket's or investigation's notifications, newest first; `latest` is the first of them. */
export type NotificationGroup = {
  key: string;
  latest: Notification;
  earlier: Notification[];
  unreadIds: number[];
};

function subjectOf(notification: Notification): string {
  if (notification.ticketId !== null) {
    return `ticket:${notification.ticketId}`;
  }
  if (notification.investigationId !== null) {
    return `investigation:${notification.investigationId}`;
  }
  return `notification:${notification.id}`;
}

/** `items` newest first, as the API pages them; groups keep that order by their newest entry. */
export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const notification of items) {
    const key = subjectOf(notification);
    const unread = notification.readAt === null ? [notification.id] : [];
    const group = groups.get(key);
    if (group) {
      group.earlier.push(notification);
      group.unreadIds.push(...unread);
    } else {
      groups.set(key, { key, latest: notification, earlier: [], unreadIds: unread });
    }
  }
  return [...groups.values()];
}
