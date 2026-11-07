// Which view of the project shows (board, investigations, pull requests, repository, usage), from the URL
// and the user's choice, and changing it; the Help menu's Getting started goes back to the board.
import { useState } from 'react';

import type { ProjectView } from '../components/project-bar';
import { useHelpRequest } from './help-requests';
import { clearInvestigateTicket, useInvestigateTicket } from './investigate-ticket';
import { clearOpenedInvestigation, useOpenedInvestigation } from './opened-investigation';
import { CLOSE_REPOSITORY, openRepository, useRepositoryOpen } from './repository-url';
import { useReviewedPullRequest } from './review-url';
import { setParams } from './url-state';

/** The view the URL or the user picked: an investigation asked for, then the Repository tab (`?view=repository`), then the tab chosen. */
function useView(chosen: ProjectView, asked: boolean): ProjectView {
  const repository = useRepositoryOpen();
  if (asked) {
    return 'investigations';
  }
  return repository ? 'repository' : chosen;
}

/** The view shown, the investigation asked for or opened from elsewhere, and changing the view. */
export function useProjectView(): {
  view: ProjectView;
  askedTicket: number | null;
  openedInvestigation: number | null;
  changeView: (next: ProjectView) => void;
} {
  const [chosen, setChosen] = useState<ProjectView>('board');
  // A pull request review in the URL (a reload, Back) is on the Pull requests view, and closing it stays there.
  const [reviewedPr] = useReviewedPullRequest();
  if (reviewedPr !== null && chosen !== 'pull-requests') {
    setChosen('pull-requests');
  }
  const askedTicket = useInvestigateTicket();
  const openedInvestigation = useOpenedInvestigation();
  const view = useView(chosen, askedTicket !== null || openedInvestigation !== null);
  const changeView = (next: ProjectView): void => {
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
  };
  // The checklist asked for from the Help menu sits on the board.
  useHelpRequest('getting-started', () => {
    changeView('board');
  });
  return { view, askedTicket, openedInvestigation, changeView };
}
