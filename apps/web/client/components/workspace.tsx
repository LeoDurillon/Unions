// Project bar plus the board, investigations or pull requests (or the empty board behind the
// first-run wizard).
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { clearInvestigateTicket, useInvestigateTicket } from '../lib/investigate-ticket';
import { clearOpenedInvestigation, useOpenedInvestigation } from '../lib/opened-investigation';
import { openSettings } from '../lib/settings-sections';
import { Board, BoardView } from './board';
import { InvestigationsPage } from './investigations/investigations-page';
import { ProjectBar, type ProjectView } from './project-bar';
import { PullRequestsPage } from './pull-requests/pull-requests-page';

function noop(): void {
  // The empty board behind the first-run wizard is display only.
}

function ProjectBody({
  project,
  view,
  askedTicket,
  openedInvestigation,
  onOpenTicket,
}: {
  project: PublicProject | null;
  view: ProjectView;
  /** A ticket a new investigation was asked about (`?investigate=`). */
  askedTicket: number | null;
  /** An investigation opened from elsewhere (`?investigation=`). */
  openedInvestigation: number | null;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  if (!project) {
    return <BoardView tickets={[]} now={0} error={null} onOpen={onOpenTicket} onDrop={noop} />;
  }
  if (view === 'investigations') {
    return (
      <InvestigationsPage
        key={`${project.id}:${askedTicket ?? ''}:${openedInvestigation ?? ''}`}
        project={project}
        initialTicket={askedTicket}
        initialInvestigation={openedInvestigation}
        onOpenTicket={onOpenTicket}
      />
    );
  }
  if (view === 'pull-requests') {
    return <PullRequestsPage key={project.id} project={project} onOpenTicket={onOpenTicket} />;
  }
  return <Board project={project} onOpen={onOpenTicket} />;
}

/** Project bar plus the board, investigations or pull requests (or the empty board behind the first-run wizard). */
export function Workspace({
  project,
  onOpenTicket,
  onNewTicket,
}: {
  project: PublicProject | null;
  onOpenTicket: (id: number) => void;
  onNewTicket: () => void;
}): ReactElement {
  const [chosen, setChosen] = useState<ProjectView>('board');
  const askedTicket = useInvestigateTicket();
  const openedInvestigation = useOpenedInvestigation();
  const view = askedTicket === null && openedInvestigation === null ? chosen : 'investigations';
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ProjectBar
        project={project}
        view={view}
        onView={(next) => {
          if (askedTicket !== null) {
            clearInvestigateTicket();
          }
          if (openedInvestigation !== null) {
            clearOpenedInvestigation();
          }
          setChosen(next);
        }}
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
        />
      </main>
    </div>
  );
}
