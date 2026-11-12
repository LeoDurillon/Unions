// The root layout of the web app: sidebar, main area, ticket panel, dialogs and the project wizard.

import type { ReactElement } from 'react';

import { AppDialogs } from './components/layout/app-dialogs';
import { MainArea } from './components/layout/main-area';
import { Sidebar } from './components/layout/sidebar';
import { WizardHost } from './components/layout/wizard-host';
import { TicketPanel } from './components/ticket/ticket-panel';
import { useAppState } from './lib/app/use-app-state';

export function App(): ReactElement {
  const state = useAppState();
  const { projects, project, ticketId, openTicket, page, overlay, show, goTo, close } = state;
  const { selectProject, openNotification, openProjectTicket } = state;

  return (
    <div className="flex h-full">
      <Sidebar
        projects={projects}
        projectId={project?.id ?? null}
        onSelect={selectProject}
        onNewProject={show('wizard')}
        page={page}
        onPage={(next) => {
          goTo(next)();
        }}
        onOpenNotification={openNotification}
      />
      <MainArea
        page={page}
        project={project}
        onOpenTicket={openTicket}
        onOpenProjectTicket={openProjectTicket}
        onNewTicket={show('ticket')}
      />
      <WizardHost
        firstRun={!state.loading && projects.length === 0}
        open={overlay === 'wizard'}
        onFinished={(id) => {
          state.select(id);
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
          key={ticketId}
          ticketId={ticketId}
          onClose={() => {
            openTicket(null);
          }}
          onOpenTicket={openTicket}
        />
      )}
    </div>
  );
}
