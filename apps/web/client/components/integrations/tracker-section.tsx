// A tracker's project settings section, by kind (Notion, Jira).
import type { IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { JiraSection } from './jira/jira-section';
import { NotionSection } from './notion/notion-section';

const SECTIONS: Record<IntegrationKindName, (props: { project: PublicProject }) => ReactElement> = {
  notion: NotionSection,
  jira: JiraSection,
};

export function TrackerSection({
  kind,
  project,
}: {
  kind: IntegrationKindName;
  project: PublicProject;
}): ReactElement {
  const Section = SECTIONS[kind];
  return <Section project={project} />;
}
