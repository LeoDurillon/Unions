// The project's settings: a menu of pages on the left, the open one on the right (`?settings=`).
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import {
  closeSettings,
  openSettings,
  SETTINGS_GROUPS,
  sectionLabel,
  type SettingsSection,
} from '../../lib/settings-sections';
import { AGENT_SECTIONS, AgentSectionBody, type AgentSection } from './agent-section-body';
import { IntegrationSectionBody } from './integration-section-body';
import { PROJECT_SECTIONS, ProjectSectionBody, type ProjectSection } from './project-section-body';
import { SettingsFrame } from './settings-frame';
import { SettingsNav } from './settings-nav';

function isProjectSection(section: SettingsSection): section is ProjectSection {
  return PROJECT_SECTIONS.some((id) => id === section);
}

function isAgentSection(section: SettingsSection): section is AgentSection {
  return AGENT_SECTIONS.some((id) => id === section);
}

function SectionBody({
  section,
  project,
}: {
  section: SettingsSection;
  project: PublicProject;
}): ReactElement {
  if (isProjectSection(section)) {
    return <ProjectSectionBody section={section} project={project} />;
  }
  if (isAgentSection(section)) {
    return <AgentSectionBody section={section} project={project} />;
  }
  return <IntegrationSectionBody section={section} project={project} />;
}

/** The project's settings: a menu of pages on the left, the open one on the right (`?settings=`). */
export function ProjectSettingsPage({
  project,
  section,
}: {
  project: PublicProject;
  section: SettingsSection;
}): ReactElement {
  return (
    <SettingsFrame
      title={`${project.owner}/${project.repo} settings`}
      subtitle={sectionLabel(section)}
      pageKey={`${project.id}:${section}`}
      nav={
        <SettingsNav
          label="Project settings"
          groups={SETTINGS_GROUPS}
          section={section}
          onOpen={openSettings}
        />
      }
      onBack={() => {
        closeSettings();
      }}
    >
      <SectionBody section={section} project={project} />
    </SettingsFrame>
  );
}
