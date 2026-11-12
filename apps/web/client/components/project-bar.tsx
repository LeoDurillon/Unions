// Slim bar above the project: which project is open, its tabs, and the actions; a banner under it
// when the project has no GitHub access.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { Button } from './ui';

export type ProjectView =
  | 'board'
  | 'investigations'
  | 'pull-requests'
  | 'repository'
  | 'environments'
  | 'usage';

const VIEWS: { view: ProjectView; label: string }[] = [
  { view: 'board', label: 'Board' },
  { view: 'investigations', label: 'Investigations' },
  { view: 'pull-requests', label: 'Pull requests' },
  { view: 'repository', label: 'Repository' },
  { view: 'environments', label: 'Environments' },
  { view: 'usage', label: 'Usage' },
];

function ViewTabs({
  view,
  onView,
}: {
  view: ProjectView;
  onView: (view: ProjectView) => void;
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Project"
      className="-mb-3 flex gap-1 self-end overflow-x-auto max-sm:order-last max-sm:w-full"
    >
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
            className={`border-b-2 px-2.5 pt-1 pb-3 text-sm font-medium whitespace-nowrap transition ${on ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
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
      <header className="flex items-center gap-5 border-b max-sm:flex-wrap max-sm:gap-y-2 border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-[15px] font-semibold whitespace-nowrap">
          {project ? (
            <>
              {project.owner}
              <span className="text-zinc-400">/</span>
              {project.repo}
            </>
          ) : (
            'No project selected'
          )}
        </h2>
        {project ? <ViewTabs view={view} onView={onView} /> : null}
        <div className="flex-1" />
        <Button onClick={onSettings} disabled={project === null}>
          Settings
        </Button>
        <Button
          variant="primary"
          className="flex items-center gap-2 whitespace-nowrap"
          title="New ticket (c)"
          onClick={onNewTicket}
          disabled={project === null}
        >
          New ticket
          <kbd className="rounded border border-current px-1 font-mono text-[10px] leading-4 opacity-70 max-sm:hidden">
            C
          </kbd>
        </Button>
      </header>
      {project?.githubAccess === 'none' ? <NoAccessBanner onSettings={onSettings} /> : null}
    </>
  );
}
