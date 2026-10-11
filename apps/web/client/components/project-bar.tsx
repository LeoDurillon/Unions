import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { Button } from './ui';

/** Slim bar above the board: which project is open, and the New ticket action. */
export function ProjectBar({
  project,
  onNewTicket,
  onSettings,
}: {
  project: PublicProject | null;
  onNewTicket: () => void;
  onSettings: () => void;
}): ReactElement {
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <h2 className="text-base font-semibold">
        {project ? `${project.owner}/${project.repo}` : 'No project selected'}
      </h2>
      {project && !project.hasGithubToken ? (
        <button
          type="button"
          onClick={onSettings}
          className="text-xs text-red-600 underline dark:text-red-400"
        >
          No GitHub token: set one
        </button>
      ) : null}
      <div className="flex-1" />
      <Button onClick={onSettings} disabled={project === null}>
        Settings
      </Button>
      <Button variant="primary" onClick={onNewTicket} disabled={project === null}>
        New ticket
      </Button>
    </header>
  );
}
