import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { useSettingsSection } from '../lib/settings-sections';
import type { Page } from '../lib/use-navigation';
import { AgentsPage } from './agents/agents-page';
import { GitHubAppPage } from './github-app/github-app-page';
import { RunningPreviewsPage } from './previews/running-previews-page';
import { ProjectSettingsPage } from './settings/settings-page';
import { Workspace } from './workspace';

/** Right-hand side of the app: a global page, the project's settings (`?settings=`), or the project. */
export function MainArea({
  page,
  project,
  onOpenTicket,
  onOpenProjectTicket,
  onNewTicket,
}: {
  page: Page;
  project: PublicProject | null;
  onOpenTicket: (id: number) => void;
  /** Opens a ticket of any project (the Previews page lists every project's). */
  onOpenProjectTicket: (projectId: number, ticketId: number) => void;
  onNewTicket: () => void;
}): ReactElement {
  const settingsSection = useSettingsSection();
  if (page === 'previews') {
    return <RunningPreviewsPage onOpenTicket={onOpenProjectTicket} />;
  }
  if (page === 'agents') {
    return <AgentsPage />;
  }
  if (page === 'github-app') {
    return <GitHubAppPage />;
  }
  if (project && settingsSection) {
    return <ProjectSettingsPage project={project} section={settingsSection} />;
  }
  return <Workspace project={project} onOpenTicket={onOpenTicket} onNewTicket={onNewTicket} />;
}
