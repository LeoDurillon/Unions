import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { closeSettings, sectionLabel, type SettingsSection } from '../../lib/settings-sections';
import { Button } from '../ui';
import { IntegrationSectionBody } from './integration-section-body';
import { PROJECT_SECTIONS, ProjectSectionBody, type ProjectSection } from './project-section-body';
import { SettingsNav } from './settings-nav';

function isProjectSection(section: SettingsSection): section is ProjectSection {
  return PROJECT_SECTIONS.some((id) => id === section);
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
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {project.owner}/{project.repo} settings
          </h2>
          <p className="text-xs text-zinc-500">{sectionLabel(section)}</p>
        </div>
        <Button
          onClick={() => {
            closeSettings();
          }}
        >
          Back to the board
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-zinc-200 p-3 dark:border-zinc-800">
          <SettingsNav section={section} />
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div key={`${project.id}:${section}`} className="mx-auto max-w-3xl p-6">
            {isProjectSection(section) ? (
              <ProjectSectionBody section={section} project={project} />
            ) : (
              <IntegrationSectionBody section={section} project={project} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
