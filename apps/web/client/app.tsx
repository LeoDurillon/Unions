import type { ReactElement } from 'react';

import { AppDialogs } from './components/app-dialogs';
import { Sidebar } from './components/sidebar';
import { TicketPanel } from './components/ticket-panel';
import { WizardHost } from './components/wizard-host';
import { MainArea } from './components/workspace';
import { useActiveProject } from './lib/use-active-project';
import { useLiveInvalidation } from './lib/use-live-invalidation';
import { useNavigation } from './lib/use-navigation';
import { useSelectedTicket } from './lib/use-selected-ticket';

export function App(): ReactElement {
  useLiveInvalidation();
  const { projects, project, select, loading } = useActiveProject();
  const [ticketId, openTicket] = useSelectedTicket();
  const { page, overlay, show, goTo, close } = useNavigation();

  return (
    <div className="flex h-full">
      <Sidebar
        projects={projects}
        projectId={project?.id ?? null}
        onSelect={(id) => {
          select(id);
          goTo('board')();
        }}
        onNewProject={show('wizard')}
        settingsActive={page === 'agents'}
        onSettings={goTo('agents')}
      />
      <MainArea
        page={page}
        project={project}
        onOpenTicket={openTicket}
        onNewTicket={show('ticket')}
        onSettings={show('settings')}
      />
      <WizardHost
        firstRun={!loading && projects.length === 0}
        open={overlay === 'wizard'}
        onFinished={(id) => {
          select(id);
          close();
        }}
        onClose={close}
      />
      <AppDialogs
        overlay={overlay}
        project={project}
        onClose={close}
        onTicketCreated={(id) => {
          close();
          openTicket(id);
        }}
      />
      {ticketId === null ? null : (
        <TicketPanel
          ticketId={ticketId}
          onClose={() => {
            openTicket(null);
          }}
        />
      )}
    </div>
  );
}
