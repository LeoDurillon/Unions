// The trackers' settings pages, events and the danger zone.

import { isIntegrationKindName, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { closeSettings } from '../../lib/settings/settings-sections';
import { TrackerSection } from '../integrations/tracker-section';
import { DeleteSection } from './delete-section';
import { EventActivitySection } from './delivery-list';
import { EventRulesSection } from './events-section';
import { SettingsIntro } from './settings-intro';

export type IntegrationSection = IntegrationKindName | 'event-rules' | 'event-activity' | 'danger';

/** The trackers, events and the danger zone. */
export function IntegrationSectionBody({
  section,
  project,
}: {
  section: IntegrationSection;
  project: PublicProject;
}): ReactElement {
  if (isIntegrationKindName(section)) {
    return <TrackerSection kind={section} project={project} />;
  }
  if (section === 'event-rules') {
    return <EventRulesSection project={project} />;
  }
  if (section === 'event-activity') {
    return <EventActivitySection project={project} />;
  }
  return (
    <>
      <SettingsIntro>What cannot be undone.</SettingsIntro>
      <DeleteSection
        project={project}
        onDeleted={() => {
          closeSettings();
        }}
      />
    </>
  );
}
