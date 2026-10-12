import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import type { Page } from '../lib/use-navigation';
import { AgentsPage } from './agents/agents-page';
import { Board, BoardView } from './board';
import { GitHubAppPage } from './github-app/github-app-page';
import { InvestigationsPage } from './investigations/investigations-page';
import { ProjectBar, type ProjectView } from './project-bar';

function noop(): void {
  // The empty board behind the first-run wizard is display only.
}

function ProjectBody({
  project,
  view,
  onOpenTicket,
}: {
  project: PublicProject | null;
  view: ProjectView;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  if (!project) {
    return <BoardView tickets={[]} error={null} onOpen={onOpenTicket} onStart={noop} />;
  }
  if (view === 'investigations') {
    return <InvestigationsPage key={project.id} project={project} />;
  }
  return <Board projectId={project.id} onOpen={onOpenTicket} />;
}

/** Project bar plus board or investigations (or the empty board behind the first-run wizard). */
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
  const [view, setView] = useState<ProjectView>('board');
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ProjectBar
        project={project}
        view={view}
        onView={setView}
        onNewTicket={onNewTicket}
        onSettings={onSettings}
      />
      <main className="min-h-0 flex-1">
        <ProjectBody project={project} view={view} onOpenTicket={onOpenTicket} />
      </main>
    </div>
  );
}

/** Right-hand side of the app: a global page, or the current project. */
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
  if (page === 'agents') {
    return <AgentsPage />;
  }
  if (page === 'github-app') {
    return <GitHubAppPage />;
  }
  return (
    <Workspace
      project={project}
      onOpenTicket={onOpenTicket}
      onNewTicket={onNewTicket}
      onSettings={onSettings}
    />
  );
}
