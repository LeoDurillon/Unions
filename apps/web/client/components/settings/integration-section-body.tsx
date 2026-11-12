// The trackers (Notion, Jira), events and the danger zone.

import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { closeSettings } from '../../lib/settings/settings-sections';
import { TrackerSection } from '../integrations/tracker-section';
import { DeleteSection } from './delete-section';
import { EventActivitySection, EventRulesSection } from './events-section';

export type IntegrationSection = 'notion' | 'jira' | 'event-rules' | 'event-activity' | 'danger';

/** The trackers, events and the danger zone. */
export function IntegrationSectionBody({
  section,
  project,
}: {
  section: IntegrationSection;
  project: PublicProject;
}): ReactElement {
  const bodies: Record<IntegrationSection, () => ReactElement> = {
    notion: () => <TrackerSection kind="notion" project={project} />,
    jira: () => <TrackerSection kind="jira" project={project} />,
    'event-rules': () => <EventRulesSection project={project} />,
    'event-activity': () => <EventActivitySection project={project} />,
    danger: () => (
      <DeleteSection
        project={project}
        onDeleted={() => {
          closeSettings();
        }}
      />
    ),
  };
  return bodies[section]();
}
