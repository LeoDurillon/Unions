// One part of the bell's panel under its title (what still asks something, or the history): its notifications
// grouped by what they are about.
import type { ReactElement } from 'react';

import type { NotificationView } from '../../../src/routes/notifications';
import { groupNotifications } from '../../lib/notification-groups';
import type { NotificationTarget } from '../../lib/open-notification';
import { NotificationGroupItem } from './notification-group';

/** One part of the panel, under its title; nothing when it has no notification. */
function NotificationSection({
  title,
  tone,
  items,
  names,
  onOpen,
}: {
  title: string;
  tone: 'amber' | 'quiet';
  items: NotificationView[];
  names: Map<number, string>;
  onOpen: (target: NotificationTarget) => void;
}): ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-label={title}>
      <h3
        className={`px-2 pb-1 text-[11px] font-semibold tracking-wider uppercase ${tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500'}`}
      >
        {title}
      </h3>
      <ul className="space-y-0.5">
        {groupNotifications(items).map((group) => (
          <NotificationGroupItem
            key={group.key}
            group={group}
            project={names.get(group.latest.projectId) ?? null}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

/** What still asks something of the user, then the rest as history. */
export function NotificationSections({
  items,
  names,
  onOpen,
}: {
  items: NotificationView[];
  names: Map<number, string>;
  onOpen: (target: NotificationTarget) => void;
}): ReactElement {
  const asking = items.filter((item) => item.toAct);
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <NotificationSection
        title={`To act on · ${groupNotifications(asking).length}`}
        tone="amber"
        items={asking}
        names={names}
        onOpen={onOpen}
      />
      <NotificationSection
        title="Earlier"
        tone="quiet"
        items={items.filter((item) => !item.toAct)}
        names={names}
        onOpen={onOpen}
      />
    </div>
  );
}
