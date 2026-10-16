// Desktop notifications: off until the user turns them on, shown by the one tab that holds the event stream.
import { isEvent } from '@union/core/event-catalog';
import { useEffect, useRef, useState } from 'react';

import { subscribeAsLead } from './event-hub';
import type { NotificationTarget } from './open-notification';

const KEY = 'union.desktopNotifications';

/** The browser's notifications, absent in some (and in insecure contexts other than `localhost`). */
function browserNotifications(): typeof globalThis.Notification | null {
  return 'Notification' in globalThis ? globalThis.Notification : null;
}

function storedOn(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function store(on: boolean): void {
  try {
    globalThis.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
}

async function ask(
  api: typeof globalThis.Notification,
  answered: (permission: NotificationPermission) => void,
): Promise<void> {
  answered(await api.requestPermission());
}

export type DesktopSetting = {
  supported: boolean;
  /** Turned on and allowed by the browser. */
  on: boolean;
  /** The browser refuses: only its site settings can allow them again. */
  blocked: boolean;
  toggle: (on: boolean) => void;
};

/** The opt-in: turning it on asks the browser's permission first. */
export function useDesktopSetting(): DesktopSetting {
  const api = browserNotifications();
  const [chosen, setChosen] = useState(storedOn);
  const [permission, setPermission] = useState(api?.permission ?? 'denied');
  return {
    supported: api !== null,
    on: chosen && permission === 'granted',
    blocked: permission === 'denied',
    toggle: (on) => {
      store(on);
      setChosen(on);
      if (on && api && api.permission === 'default') {
        void ask(api, setPermission);
      }
    },
  };
}

/**
 * Shows each new notification on the desktop while Union is not in view, when the user turned
 * them on. Only the tab holding the stream shows it; a click focuses Union and opens it.
 */
export function useDesktopNotifications(onOpen: (target: NotificationTarget) => void): void {
  const open = useRef(onOpen);
  useEffect(() => {
    open.current = onOpen;
  }, [onOpen]);
  useEffect(
    () =>
      subscribeAsLead((event) => {
        const DesktopNotification = browserNotifications();
        const hidden = globalThis.document.visibilityState !== 'visible';
        if (!isEvent(event, 'notification_created') || !DesktopNotification || !hidden) {
          return;
        }
        if (!storedOn() || DesktopNotification.permission !== 'granted') {
          return;
        }
        const { notificationId, title, detail, ...target } = event.payload;
        const shown = new DesktopNotification(title, {
          body: detail,
          tag: `union-${notificationId}`,
        });
        shown.addEventListener('click', () => {
          globalThis.focus();
          open.current({ id: notificationId, ...target });
          shown.close();
        });
      }),
    [],
  );
}
