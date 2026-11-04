// Project bar plus the board, investigations, pull requests or usage (or the empty board behind the
// first-run wizard).
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { clearInvestigateTicket, useInvestigateTicket } from '../lib/investigate-ticket';
import { clearOpenedInvestigation, useOpenedInvestigation } from '../lib/opened-investigation';
import { useReviewedPullRequest } from '../lib/review-url';
import { openSettings } from '../lib/settings-sections';
import { ProjectBar, type ProjectView } from './project-bar';
import { ProjectBody } from './project-body';

/** Project bar plus the board, investigations, pull requests or usage (or the empty board behind the first-run wizard). */
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
