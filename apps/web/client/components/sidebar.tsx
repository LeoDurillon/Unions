import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import type { NotificationTarget } from '../lib/open-notification';
import type { Page } from '../lib/use-navigation';
import { NotificationBell } from './notifications/notification-bell';
import { PreviewsButton } from './previews/previews-button';
import { Button } from './ui';

const ACTIVE = 'bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200';
const IDLE = 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800';

function ProjectItem({
  project,
  active,
  onSelect,
}: {
  project: PublicProject;
  active: boolean;
  onSelect: (id: number) => void;
}): ReactElement {
  const state = active ? ACTIVE : IDLE;
  return (
    <li>
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        title={`${project.owner}/${project.repo}`}
        onClick={() => {
          onSelect(project.id);
        }}
        className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm transition ${state}`}
      >
        <span className="text-zinc-500">{project.owner}/</span>
        {project.repo}
      </button>
    </li>
  );
}

/** The settings every project shares, below the projects. */
function SettingsLink({ active, onOpen }: { active: boolean; onOpen: () => void }): ReactElement {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onOpen}
      className={`rounded-md px-3 py-2 text-left text-sm transition ${active ? ACTIVE : IDLE}`}
    >
      Union settings
    </button>
  );
}

/** Notifications, running previews, project switcher and creation entry point, always visible on the left. */
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
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-3 border-r border-zinc-200 bg-zinc-100/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h1 className="px-2 pt-1 text-base font-semibold">union</h1>
      <NotificationBell projects={projects} onOpen={onOpenNotification} />
      <PreviewsButton
        active={page === 'previews'}
        onOpen={() => {
          onPage('previews');
        }}
      />
      <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-3 pb-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">
          Projects
        </p>
        <ul className="space-y-0.5">
          {projects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              active={page === 'board' && project.id === projectId}
              onSelect={onSelect}
            />
          ))}
        </ul>
        {projects.length === 0 ? (
          <p className="px-3 text-sm text-zinc-500">No project yet.</p>
        ) : null}
      </nav>
      <Button onClick={onNewProject}>+ Add project</Button>
      <SettingsLink
        active={page === 'settings'}
        onOpen={() => {
          onPage('settings');
        }}
      />
    </aside>
  );
}
