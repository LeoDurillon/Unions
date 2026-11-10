// Which view of the project shows (board, investigations, pull requests, repository, environments, usage), from the URL
// and the user's choice, and changing it; the Help menu's Getting started goes back to the board.

import { useState } from 'react';

import type { ProjectView } from '../components/project-bar';
import {
  CLOSE_ENVIRONMENTS,
  showEnvironments,
  useEnvironmentsOpen,
  useOldPreviewSettings,
} from './environments-url';
import { useHelpRequest } from './help-requests';
import { clearInvestigateTicket, useInvestigateTicket } from './investigate-ticket';
import { clearOpenedInvestigation, useOpenedInvestigation } from './opened-investigation';
import { CLOSE_REPOSITORY, openRepository, useRepositoryOpen } from './repository-url';
import { useReviewedPullRequest } from './review/review-url';
import { setParams } from './url-state';

/**
 * The view the URL or the user picked: an investigation asked for, then the Repository or the
 * Environments tab (`?view=`), then the tab chosen.
 */
function useView(chosen: ProjectView, asked: boolean): ProjectView {
  const repository = useRepositoryOpen();
  const environments = useEnvironmentsOpen();
  useOldPreviewSettings();
  if (asked) {
    return 'investigations';
  }
  if (repository) {
    return 'repository';
  }
  return environments ? 'environments' : chosen;
}

/** The views the URL holds (`?view=`): leaving one clears what it put there. */
function leaveUrlView(view: ProjectView): void {
  if (view === 'repository') {
    setParams(CLOSE_REPOSITORY);
  }
  if (view === 'environments') {
    setParams(CLOSE_ENVIRONMENTS);
  }
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
    if (next !== view) {
      leaveUrlView(view);
    }
    if (next === 'repository') {
      openRepository();
      return;
    }
    if (next === 'environments') {
      showEnvironments();
      return;
    }
    setChosen(next);
  };
  // The checklist asked for from the Help menu sits on the board.
  useHelpRequest('getting-started', () => {
    changeView('board');
  });
  return { view, askedTicket, openedInvestigation, changeView };
}
