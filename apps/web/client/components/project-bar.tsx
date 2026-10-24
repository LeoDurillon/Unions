// Slim bar above the project: which project is open, its tabs, and the actions; a banner under it
// when the project has no GitHub access.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { Button } from './ui';

export type ProjectView = 'board' | 'investigations' | 'pull-requests';

const VIEWS: { view: ProjectView; label: string }[] = [
  { view: 'board', label: 'Board' },
  { view: 'investigations', label: 'Investigations' },
  { view: 'pull-requests', label: 'Pull requests' },
];

function ViewTabs({
  view,
  onView,
}: {
  view: ProjectView;
  onView: (view: ProjectView) => void;
}): ReactElement {
  return (
    <div role="tablist" aria-label="Project" className="flex gap-1">
      {VIEWS.map((entry) => {
        const on = entry.view === view;
        return (
          <button
            key={entry.view}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              onView(entry.view);
            }}
            className={`rounded-md px-3 py-1 text-sm transition ${on ? 'bg-indigo-100 font-medium dark:bg-indigo-950' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'}`}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

/** Nothing on GitHub works for the project until it has a token or the GitHub App. */
function NoAccessBanner({ onSettings }: { onSettings: () => void }): ReactElement {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      <span className="min-w-0 flex-1">
        No GitHub access: Union cannot read or update this project&apos;s issues, branches and pull
        requests.
      </span>
      <Button onClick={onSettings}>Set up access</Button>
    </div>
  );
}

/** Slim bar above the project: which project is open, its tabs, and the actions. */
export function ProjectBar({
  project,
  view,
  onView,
  onNewTicket,
  onSettings,
}: {
  project: PublicProject | null;
  view: ProjectView;
  onView: (view: ProjectView) => void;
  onNewTicket: () => void;
  onSettings: () => void;
}): ReactElement {
  return (
    <>
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-base font-semibold">
          {project ? `${project.owner}/${project.repo}` : 'No project selected'}
        </h2>
        {project ? <ViewTabs view={view} onView={onView} /> : null}
        <div className="flex-1" />
        <Button onClick={onSettings} disabled={project === null}>
          Settings
        </Button>
        <Button variant="primary" onClick={onNewTicket} disabled={project === null}>
          New ticket
        </Button>
      </header>
      {project?.githubAccess === 'none' ? <NoAccessBanner onSettings={onSettings} /> : null}
    </>
  );
}
