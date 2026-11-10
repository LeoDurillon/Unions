// The open view of the project: the board, its investigations, its pull requests, its repository, its
// environments or its usage.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { Board, BoardView } from './board';
import { EnvironmentsPage } from './environments/environments-page';
import { GettingStarted } from './getting-started';
import { InvestigationsPage } from './investigations/investigations-page';
import { UsagePage } from './lazy-pages';
import type { ProjectView } from './project-bar';
import { PullRequestsPage } from './pull-requests/pull-requests-page';
import { RepositoryPage } from './repository/repository-page';

/** The open view of the project; the empty board behind the first-run wizard when there is none. */
export function ProjectBody({
  project,
  view,
  askedTicket,
  openedInvestigation,
  onOpenTicket,
  onNewTicket,
}: {
  project: PublicProject | null;
  view: ProjectView;
  /** A ticket a new investigation was asked about (`?investigate=`). */
  askedTicket: number | null;
  /** An investigation opened from elsewhere (`?investigation=`). */
  openedInvestigation: number | null;
  onOpenTicket: (id: number) => void;
  onNewTicket: () => void;
}): ReactElement {
  if (!project) {
    return <BoardView tickets={[]} now={0} error={null} onOpen={onOpenTicket} />;
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
  if (view === 'repository') {
    return <RepositoryPage key={project.id} project={project} />;
  }
  if (view === 'environments') {
    return <EnvironmentsPage key={project.id} project={project} onOpenTicket={onOpenTicket} />;
  }
  if (view === 'usage') {
    return <UsagePage key={project.id} project={project} onOpenTicket={onOpenTicket} />;
  }
  if (view === 'pull-requests') {
    return <PullRequestsPage key={project.id} project={project} onOpenTicket={onOpenTicket} />;
  }
  return (
    <div className="flex h-full flex-col">
      <GettingStarted key={project.id} project={project} onNewTicket={onNewTicket} />
      <div className="min-h-0 flex-1">
        <Board project={project} onOpen={onOpenTicket} />
      </div>
    </div>
  );
}
