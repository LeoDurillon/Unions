import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import type { Page } from '../lib/use-navigation';
import { AgentsPage } from './agents/agents-page';
import { Board, BoardView } from './board';
import { ProjectBar } from './project-bar';

function noop(): void {
  // The empty board behind the first-run wizard is display only.
}

/** Project bar plus board (or the empty board behind the first-run wizard). */
export function Workspace({
  project,
  onOpenTicket,
  onNewTicket,
  onSettings,
}: {
  project: PublicProject | null;
  onOpenTicket: (id: number) => void;
  onNewTicket: () => void;
  onSettings: () => void;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ProjectBar project={project} onNewTicket={onNewTicket} onSettings={onSettings} />
      <main className="min-h-0 flex-1">
        {project ? (
          <Board projectId={project.id} onOpen={onOpenTicket} />
        ) : (
          <BoardView tickets={[]} error={null} onOpen={onOpenTicket} onStart={noop} />
        )}
      </main>
    </div>
  );
}

/** Right-hand side of the app: the agent settings page or the current project's board. */
export function MainArea({
  page,
  project,
  onOpenTicket,
  onNewTicket,
  onSettings,
}: {
  page: Page;
  project: PublicProject | null;
  onOpenTicket: (id: number) => void;
  onNewTicket: () => void;
  onSettings: () => void;
}): ReactElement {
  return page === 'agents' ? (
    <AgentsPage />
  ) : (
    <Workspace
      project={project}
      onOpenTicket={onOpenTicket}
      onNewTicket={onNewTicket}
      onSettings={onSettings}
    />
  );
}
