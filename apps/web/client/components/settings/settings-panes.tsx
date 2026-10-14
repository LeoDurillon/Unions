import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { BranchSection } from './branch-section';
import { ChecksSection } from './checks-section';
import { DeleteSection } from './delete-section';
import { GitHubAccessSection } from './github-access-section';
import { InstructionsSection } from './instructions-section';
import { EventsSection, NotionSection } from './notion-section';
import { PreviewSettingsSection, PullRequestSection } from './pull-request-section';
import { ReviewSection } from './review-section';

export const PANES = [
  { id: 'general', label: 'General' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'checks', label: 'Checks' },
  { id: 'pull-requests', label: 'Pull requests' },
  { id: 'review', label: 'Review' },
  { id: 'preview', label: 'Preview' },
  { id: 'notion', label: 'Notion' },
  { id: 'events', label: 'Events' },
  { id: 'danger', label: 'Danger zone' },
] as const;
export type Pane = (typeof PANES)[number]['id'];

/** The settings shown under one tab of the project settings dialog. */
export function PaneBody({
  pane,
  project,
  onDeleted,
}: {
  pane: Pane;
  project: PublicProject;
  onDeleted: () => void;
}): ReactElement {
  const bodies: Record<Pane, ReactElement> = {
    general: (
      <div className="space-y-6">
        <GitHubAccessSection project={project} />
        <BranchSection project={project} />
      </div>
    ),
    instructions: <InstructionsSection project={project} />,
    checks: <ChecksSection project={project} />,
    'pull-requests': <PullRequestSection project={project} />,
    review: <ReviewSection project={project} />,
    preview: <PreviewSettingsSection project={project} />,
    notion: <NotionSection project={project} />,
    events: <EventsSection project={project} />,
    danger: <DeleteSection project={project} onDeleted={onDeleted} />,
  };
  return bodies[pane];
}
