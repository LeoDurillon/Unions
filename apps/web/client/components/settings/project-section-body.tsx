// The project's own settings and its pull requests'.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { BranchSection } from './branch-section';
import { FilesSection } from './files-section';
import { GitHubAccessSection } from './github-access-section';
import { PullRequestSection } from './pull-request-section';
import { ReviewSection } from './review-section';

export const PROJECT_SECTIONS = ['general', 'files', 'pull-requests', 'review'] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

/** The project's own settings and its pull requests'. */
export function ProjectSectionBody({
  section,
  project,
}: {
  section: ProjectSection;
  project: PublicProject;
}): ReactElement {
  const bodies: Record<ProjectSection, () => ReactElement> = {
    general: () => (
      <div className="space-y-6">
        <GitHubAccessSection project={project} />
        <BranchSection project={project} />
      </div>
    ),
    files: () => <FilesSection project={project} />,
    'pull-requests': () => <PullRequestSection project={project} />,
    review: () => <ReviewSection project={project} />,
  };
  return bodies[section]();
}
