// The project's own settings, its GitHub Project and its pull requests'.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { GitHubProjectSection } from '../integrations/github-project-section';
import { BranchSection } from './branch-section';
import { FilesSection } from './files-section';
import { GitHubAccessSection } from './github-access-section';
import { IssuesSection } from './issues-section';
import { PullRequestSection } from './pull-request-section';
import { ReviewSection } from './review-section';

/** Shown in their menu groups (`settings-sections.ts`); the GitHub Project is listed under Integrations. */
export const PROJECT_SECTIONS = [
  'general',
  'files',
  'github-project',
  'pull-requests',
  'review',
] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

/** The project's own settings, its GitHub Project and its pull requests'. */
export function ProjectSectionBody({
  section,
  project,
}: {
  section: ProjectSection;
  project: PublicProject;
}): ReactElement {
  const bodies: Record<ProjectSection, () => ReactElement> = {
    general: () => (
      // Each part of General is a card (`.settings-cards`): its Save bar shows inside it once it holds something to save.
      <div className="space-y-4">
        <GitHubAccessSection project={project} />
        <BranchSection project={project} />
        <IssuesSection project={project} />
      </div>
    ),
    files: () => <FilesSection project={project} />,
    'github-project': () => <GitHubProjectSection project={project} />,
    'pull-requests': () => <PullRequestSection project={project} />,
    review: () => <ReviewSection project={project} />,
  };
  return bodies[section]();
}
