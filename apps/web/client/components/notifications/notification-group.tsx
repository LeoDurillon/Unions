// One ticket's or investigation's notifications: the latest, and the earlier ones folded under it.
import { useState, type ReactElement } from 'react';

import type { NotificationGroup } from '../../lib/notification-groups';
import type { NotificationTarget } from '../../lib/open-notification';
import { NotificationItem } from './notification-item';

/** Opening any of them opens their ticket or investigation and marks the whole group read. */
export function NotificationGroupItem({
  group,
  project,
  onOpen,
}: {
  group: NotificationGroup;
  project: string | null;
  onOpen: (target: NotificationTarget) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const openOne = (target: NotificationTarget): void => {
    onOpen({ ...target, alsoRead: group.unreadIds.filter((id) => id !== target.id) });
  };
  const count = group.earlier.length;
  const unreadEarlier = group.unreadIds.filter((id) => id !== group.latest.id).length;
  return (
    <li>
      <ul>
        <NotificationItem notification={group.latest} project={project} onOpen={openOne} />
      </ul>
      {count === 0 ? null : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
          className="ml-6 rounded px-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {open ? '▾' : '▸'} {count} earlier
          {unreadEarlier > 0 ? `, ${unreadEarlier} unread` : ''}
        </button>
      )}
      {open ? (
        <ul className="ml-4 border-l border-zinc-200 pl-1 dark:border-zinc-800">
          {group.earlier.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              project={project}
              onOpen={openOne}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
