// The sidebar's bell: how many notifications still ask something of the user, and the panel it opens.
import { useCallback, useRef, useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { NotificationTarget } from '../../lib/open-notification';
import { useNotifications } from '../../lib/use-notifications';
import { SIDE_BADGE, SIDE_ITEM, SIDE_LABEL } from '../sidebar-classes';
import { NotificationPanel } from './notification-panel';

/** More than this shows as `99+`. */
const MAX_COUNT = 99;

function BellIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M10 2a6 6 0 0 0-6 6v3.59l-1.7 1.7A1 1 0 0 0 3 15h14a1 1 0 0 0 .7-1.7L16 11.58V8a6 6 0 0 0-6-6Zm0 16a3 3 0 0 1-2.83-2h5.66A3 3 0 0 1 10 18Z" />
    </svg>
  );
}

export function NotificationBell({
  projects,
  onOpen,
}: {
  projects: PublicProject[];
  onOpen: (target: NotificationTarget) => void;
}): ReactElement {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback((): void => {
    setOpen(false);
  }, []);
  const { unread, toAct } = notifications;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={
          toAct > 0 ? `Notifications, ${toAct} to act on, ${unread} unread` : 'Notifications'
        }
        onClick={() => {
          setOpen(!open);
        }}
        title="Notifications"
        className={`${SIDE_ITEM} hover:bg-zinc-200/70 dark:hover:bg-zinc-800`}
      >
        <BellIcon />
        <span className={SIDE_LABEL}>Notifications</span>
        {toAct > 0 ? (
          <span className={`${SIDE_BADGE} bg-amber-500`}>
            {toAct > MAX_COUNT ? `${MAX_COUNT}+` : toAct}
          </span>
        ) : null}
      </button>
      {open ? (
        <NotificationPanel
          notifications={notifications}
          projects={projects}
          box={box}
          onClose={close}
          onOpen={(notification) => {
            close();
            onOpen(notification);
          }}
        />
      ) : null}
    </div>
  );
}
