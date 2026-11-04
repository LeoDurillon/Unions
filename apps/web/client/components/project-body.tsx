// The open view of the project: the board, its investigations, its pull requests or its usage.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { Board, BoardView } from './board';
import { InvestigationsPage } from './investigations/investigations-page';
import type { ProjectView } from './project-bar';
import { PullRequestsPage } from './pull-requests/pull-requests-page';
import { UsagePage } from './usage/usage-page';

function noop(): void {
  // The empty board behind the first-run wizard is display only.
}

/** The open view of the project; the empty board behind the first-run wizard when there is none. */
export function ProjectBody({
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
  if (view === 'usage') {
    return <UsagePage key={project.id} project={project} onOpenTicket={onOpenTicket} />;
  }
  if (view === 'pull-requests') {
    return <PullRequestsPage key={project.id} project={project} onOpenTicket={onOpenTicket} />;
  }
  return <Board project={project} onOpen={onOpenTicket} />;
}
