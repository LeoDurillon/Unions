import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { clearInvestigateTicket, useInvestigateTicket } from '../lib/investigate-ticket';
import { openSettings } from '../lib/settings-sections';
import { Board, BoardView } from './board';
import { InvestigationsPage } from './investigations/investigations-page';
import { ProjectBar, type ProjectView } from './project-bar';
import { CurrentReviewsPage } from './pull-requests/current-reviews-page';
import { PullRequestsPage } from './pull-requests/pull-requests-page';

function noop(): void {
  // The empty board behind the first-run wizard is display only.
}

function ProjectBody({
  project,
  view,
  askedTicket,
  onOpenTicket,
}: {
  project: PublicProject | null;
  view: ProjectView;
  /** A ticket a new investigation was asked about (`?investigate=`). */
  askedTicket: number | null;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  if (!project) {
    return <BoardView tickets={[]} now={0} error={null} onOpen={onOpenTicket} onStart={noop} />;
  }
  if (view === 'investigations') {
    return (
      <InvestigationsPage
        key={`${project.id}:${askedTicket ?? ''}`}
        project={project}
        initialTicket={askedTicket}
        onOpenTicket={onOpenTicket}
      />
    );
  }
  if (view === 'current-reviews') {
    return <CurrentReviewsPage key={project.id} project={project} />;
  }
  if (view === 'pull-requests') {
    return <PullRequestsPage key={project.id} project={project} onOpenTicket={onOpenTicket} />;
  }
  return <Board projectId={project.id} onOpen={onOpenTicket} />;
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
  const view = askedTicket === null ? chosen : 'investigations';
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ProjectBar
        project={project}
        view={view}
        onView={(next) => {
          if (askedTicket !== null) {
            clearInvestigateTicket();
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
          onOpenTicket={onOpenTicket}
        />
      </main>
    </div>
  );
}
