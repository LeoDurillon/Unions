// The bell's panel: the notifications newest first, grouped by ticket, "Mark all read", "Delete all", older ones on request, and the desktop opt-in (folded).
import { useEffect, type ReactElement, type RefObject } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useDesktopSetting } from '../../lib/desktop-notifications';
import { groupNotifications } from '../../lib/notification-groups';
import type { NotificationTarget } from '../../lib/open-notification';
import type { Notifications } from '../../lib/use-notifications';
import { Switch } from '../choice';
import { Button, ErrorText } from '../ui';
import { NotificationGroupItem } from './notification-group';

/** Closes the panel on Escape or a click outside `box` (the bell and the panel). */
function useDismiss(box: RefObject<HTMLDivElement | null>, close: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !box.current?.contains(event.target)) {
        close();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('pointerdown', onPointer);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('pointerdown', onPointer);
    };
  }, [box, close]);
}

/** Folded to one line saying where it stands; the switch and why it is blocked inside. */
function DesktopSwitch(): ReactElement | null {
  const setting = useDesktopSetting();
  if (!setting.supported) {
    return null;
  }
  let state = setting.on ? 'on' : 'off';
  if (setting.blocked) {
    state = 'blocked by the browser';
  }
  return (
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer select-none">Desktop notifications: {state}</summary>
      <div className="pt-2">
        <DesktopToggle setting={setting} />
      </div>
    </details>
  );
}

function DesktopToggle({
  setting,
}: {
  setting: ReturnType<typeof useDesktopSetting>;
}): ReactElement {
  return (
    <Switch
      checked={setting.on}
      disabled={setting.blocked}
      onChange={(on) => {
        setting.toggle(on);
      }}
      hint={
        setting.blocked
          ? 'The browser blocks them: allow notifications for this site in its settings.'
          : 'While Union is not in view.'
      }
    >
      Desktop notifications
    </Switch>
  );
}

function PanelHeader({ notifications }: { notifications: Notifications }): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold">Notifications</h2>
      <Button
        className="ml-auto"
        disabled={notifications.unread === 0}
        onClick={() => {
          notifications.markAllRead();
        }}
      >
        Mark all read
      </Button>
      <Button
        disabled={notifications.items.length === 0}
        title="Delete every notification"
        onClick={() => {
          if (globalThis.confirm('Delete every notification? They cannot be brought back.')) {
            notifications.clearAll();
          }
        }}
      >
        Delete all
      </Button>
    </div>
  );
}

export function NotificationPanel({
  notifications,
  projects,
  box,
  onClose,
  onOpen,
}: {
  notifications: Notifications;
  projects: PublicProject[];
  box: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onOpen: (target: NotificationTarget) => void;
}): ReactElement {
  useDismiss(box, onClose);
  const names = new Map(
    projects.map((project) => [project.id, `${project.owner}/${project.repo}`]),
  );
  const { items } = notifications;
  return (
    <section
      aria-label="Notifications"
      className="absolute top-0 left-full z-30 ml-2 flex max-h-[80vh] w-96 flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
    >
      <PanelHeader notifications={notifications} />
      <ErrorText error={notifications.error} />
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {groupNotifications(items).map((group) => (
          <NotificationGroupItem
            key={group.key}
            group={group}
            project={names.get(group.latest.projectId) ?? null}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="px-2 text-sm text-zinc-500">
          Nothing yet. Approvals, failures, the usage limit, merged pull requests and finished
          investigations show here.
        </p>
      ) : null}
      {notifications.hasOlder ? (
        <Button
          onClick={() => {
            notifications.loadOlder();
          }}
        >
          Show older
        </Button>
      ) : null}
      <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
        <DesktopSwitch />
      </div>
    </section>
  );
}
