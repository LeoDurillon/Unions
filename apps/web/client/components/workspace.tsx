// Project bar plus the board, investigations, pull requests, repository or usage. Or the empty
// board behind the first-run wizard.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { openSettings } from '../lib/settings-sections';
import { useProjectView } from '../lib/use-project-view';
import { ProjectBar } from './project-bar';
import { ProjectBody } from './project-body';

/** Project bar plus the board, investigations, pull requests, repository or usage (or the empty board behind the first-run wizard). */
export function Workspace({
  project,
  onOpenTicket,
  onNewTicket,
}: {
  project: PublicProject | null;
  onOpenTicket: (id: number) => void;
  onNewTicket: () => void;
}): ReactElement {
  const { view, askedTicket, openedInvestigation, changeView } = useProjectView();
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ProjectBar
        project={project}
        view={view}
        onView={changeView}
        onNewTicket={onNewTicket}
        onSettings={() => {
          openSettings();
        }}
      />
      <main className="min-h-0 flex-1">
        <ProjectBody
          project={project}
          view={view}
          askedTicket={askedTicket}
          openedInvestigation={openedInvestigation}
          onOpenTicket={onOpenTicket}
          onNewTicket={onNewTicket}
        />
      </main>
    </div>
  );
}
