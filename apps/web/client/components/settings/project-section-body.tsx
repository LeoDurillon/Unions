import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { BranchSection } from './branch-section';
import { ChecksSection } from './checks-section';
import { FilesSection } from './files-section';
import { GitHubAccessSection } from './github-access-section';
import { InstructionsSection } from './instructions-section';
import { PullRequestSection } from './pull-request-section';
import { ReviewSection } from './review-section';
import { ScriptsSection } from './scripts-section';

export const PROJECT_SECTIONS = [
  'general',
  'files',
  'instructions',
  'checks',
  'scripts',
  'pull-requests',
  'review',
] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

/** The project's own settings, its agents' and its pull requests'. */
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
    instructions: () => <InstructionsSection project={project} />,
    checks: () => <ChecksSection project={project} />,
    scripts: () => <ScriptsSection project={project} />,
    'pull-requests': () => <PullRequestSection project={project} />,
    review: () => <ReviewSection project={project} />,
  };
  return bodies[section]();
}
