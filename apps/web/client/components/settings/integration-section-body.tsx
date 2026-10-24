// Previews, Notion and the danger zone.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { closeSettings } from '../../lib/settings-sections';
import { NotionSection } from '../integrations/notion/notion-section';
import { DeleteSection } from './delete-section';
import { EventActivitySection, EventRulesSection } from './events-section';
import { PreviewE2ePage } from './preview-e2e-page';
import { PreviewLimitsPage } from './preview-limits-page';
import { PreviewServicesPage } from './preview-services-page';
import { PreviewVariablesPage } from './preview-variables-page';

export type IntegrationSection =
  | 'preview-services'
  | 'preview-variables'
  | 'preview-e2e'
  | 'preview-limits'
  | 'notion'
  | 'event-rules'
  | 'event-activity'
  | 'danger';

/** Previews, Notion and the danger zone. */
export function IntegrationSectionBody({
  section,
  project,
}: {
  section: IntegrationSection;
  project: PublicProject;
}): ReactElement {
  const bodies: Record<IntegrationSection, () => ReactElement> = {
    'preview-services': () => <PreviewServicesPage project={project} />,
    'preview-variables': () => <PreviewVariablesPage project={project} />,
    'preview-e2e': () => <PreviewE2ePage project={project} />,
    'preview-limits': () => <PreviewLimitsPage project={project} />,
    notion: () => <NotionSection project={project} />,
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
