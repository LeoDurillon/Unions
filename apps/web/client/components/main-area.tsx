// Right-hand side of the app: the running previews, the user guide (`?guide=`), the Union settings
// (`?union=`), the project's settings (`?settings=`), or the project; and the keyboard shortcuts' list.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { useSettingsSection } from '../lib/settings-sections';
import { closeUnionSettings, useUnionSection } from '../lib/union-settings-sections';
import type { Page } from '../lib/use-navigation';
import { GlobalPage } from './global-page';
import { ProjectSettingsPage, UnionSettingsPage } from './lazy-pages';
import { ShortcutsHelp } from './shortcuts-help';
import { Workspace } from './workspace';

type MainAreaProps = {
  page: Page;
  project: PublicProject | null;
  onOpenTicket: (id: number) => void;
  /** Opens a ticket of any project (the Previews page lists every project's). */
  onOpenProjectTicket: (projectId: number, ticketId: number) => void;
  onNewTicket: () => void;
};

/** The page itself; `settingsSection` is the project settings page open, if any. */
function MainPage({
  page,
  project,
  onOpenTicket,
  onOpenProjectTicket,
  onNewTicket,
  settingsSection,
}: MainAreaProps & { settingsSection: ReturnType<typeof useSettingsSection> }): ReactElement {
  const unionSection = useUnionSection();
  if (page === 'previews' || page === 'guide') {
    return <GlobalPage page={page} onOpenTicket={onOpenProjectTicket} />;
  }
  if (page === 'settings' && unionSection) {
    return (
      <UnionSettingsPage
        section={unionSection}
        onBack={() => {
          closeUnionSettings();
        }}
      />
    );
  }
  if (project && settingsSection) {
    return <ProjectSettingsPage project={project} section={settingsSection} />;
  }
  return <Workspace project={project} onOpenTicket={onOpenTicket} onNewTicket={onNewTicket} />;
}

/**
 * Right-hand side of the app: the running previews, the user guide (`?guide=`), the Union settings
 * (`?union=`), the project's settings (`?settings=`), or the project. `c` writes a new ticket only on the project's own page.
 */
export function MainArea(props: MainAreaProps): ReactElement {
  const settingsSection = useSettingsSection();
  const onProject = props.page === 'board' && props.project !== null && !settingsSection;
  return (
    <>
      <MainPage {...props} settingsSection={settingsSection} />
      <ShortcutsHelp onNewTicket={onProject ? props.onNewTicket : undefined} />
    </>
  );
}
