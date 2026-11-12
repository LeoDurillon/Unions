// A tracker's project settings page, by kind (Notion, Jira): what importing from it does, then its connection.
import type { IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { SettingsIntro } from '../settings/settings-intro';
import { JiraSection } from './jira/jira-section';
import { NotionSection } from './notion/notion-section';

const INTROS: Record<IntegrationKindName, string> = {
  notion:
    'Connect a Notion data source: import its pages as tickets, link tickets to their page, and let the event rules update it.',
  jira: 'Connect a Jira project: import its issues as tickets, link tickets to their issue, and let the event rules update it.',
};

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
  return (
    <>
      <SettingsIntro>{INTROS[kind]}</SettingsIntro>
      <Section project={project} />
    </>
  );
}
