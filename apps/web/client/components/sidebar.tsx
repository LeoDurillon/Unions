// Notifications, running previews, project switcher and creation entry point, and Union's Update,
// always visible on the left; folds to an icon rail.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import type { NotificationTarget } from '../lib/open-notification';
import { useCompactSidebar } from '../lib/use-compact-sidebar';
import type { Page } from '../lib/use-navigation';
import { NotificationBell } from './notifications/notification-bell';
import { PreviewsButton } from './previews/previews-button';
import { ProjectNav, SettingsLink } from './sidebar-entries';
import { UpdateButton } from './union-update/update-button';

/** The name, and the button that folds the sidebar to its rail or unfolds it. */
function SidebarTitle({
  compact,
  onToggle,
}: {
  compact: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between pt-1 pl-2 group-data-[compact]/side:justify-center group-data-[compact]/side:pl-0">
      <h1 className="text-base font-semibold group-data-[compact]/side:sr-only">union</h1>
      <button
        type="button"
        aria-label={compact ? 'Expand the sidebar' : 'Collapse the sidebar'}
        title={compact ? 'Expand the sidebar' : 'Collapse the sidebar'}
        aria-expanded={!compact}
        onClick={onToggle}
        className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        {compact ? '»' : '«'}
      </button>
    </div>
  );
}

/** Notifications, running previews, project switcher and creation entry point, and Union's Update, always visible on the left. */
export function Sidebar({
  projects,
  projectId,
  onSelect,
  onNewProject,
  page,
  onPage,
  onOpenNotification,
}: {
  projects: PublicProject[];
  projectId: number | null;
  onSelect: (id: number) => void;
  onNewProject: () => void;
  page: Page;
  onPage: (page: Page) => void;
  onOpenNotification: (target: NotificationTarget) => void;
}): ReactElement {
  const [compact, toggle] = useCompactSidebar();
  return (
    <aside
      data-compact={compact ? '' : undefined}
      className="group/side flex w-60 shrink-0 flex-col gap-3 border-r border-zinc-200 bg-zinc-100/60 p-3 data-[compact]:w-14 data-[compact]:px-2 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <SidebarTitle compact={compact} onToggle={toggle} />
      <NotificationBell projects={projects} onOpen={onOpenNotification} />
      <PreviewsButton
        active={page === 'previews'}
        onOpen={() => {
          onPage('previews');
        }}
      />
      <ProjectNav
        projects={projects}
        activeId={page === 'board' ? projectId : null}
        onSelect={onSelect}
        onNewProject={onNewProject}
      />
      <SettingsLink
        active={page === 'settings'}
        onOpen={() => {
          onPage('settings');
        }}
      />
      <UpdateButton />
    </aside>
  );
}
