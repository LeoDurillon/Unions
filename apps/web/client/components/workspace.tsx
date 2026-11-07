// Project bar plus the board, investigations, pull requests, repository or usage (or the empty board
// behind the first-run wizard).
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { clearInvestigateTicket, useInvestigateTicket } from '../lib/investigate-ticket';
import { clearOpenedInvestigation, useOpenedInvestigation } from '../lib/opened-investigation';
import { CLOSE_REPOSITORY, openRepository, useRepositoryOpen } from '../lib/repository-url';
import { useReviewedPullRequest } from '../lib/review-url';
import { openSettings } from '../lib/settings-sections';
import { setParams } from '../lib/url-state';
import { ProjectBar, type ProjectView } from './project-bar';
import { ProjectBody } from './project-body';

/** The view the URL or the user picked: an investigation asked for, then the Repository tab (`?view=repository`), then the tab chosen. */
function useView(chosen: ProjectView, asked: boolean): ProjectView {
  const repository = useRepositoryOpen();
  if (asked) {
    return 'investigations';
  }
  return repository ? 'repository' : chosen;
}

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
  const [chosen, setChosen] = useState<ProjectView>('board');
  // A pull request review in the URL (a reload, Back) is on the Pull requests view, and closing it stays there.
  const [reviewedPr] = useReviewedPullRequest();
  if (reviewedPr !== null && chosen !== 'pull-requests') {
    setChosen('pull-requests');
  }
  const askedTicket = useInvestigateTicket();
  const openedInvestigation = useOpenedInvestigation();
  const view = useView(chosen, askedTicket !== null || openedInvestigation !== null);
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
          if (next === 'repository') {
            openRepository();
            return;
          }
          if (view === 'repository') {
            setParams(CLOSE_REPOSITORY);
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
          onNewTicket={onNewTicket}
        />
      </main>
    </div>
  );
}
