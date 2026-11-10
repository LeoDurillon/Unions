// A project's Board tab: the setup agent's run and the getting-started list above the board.
import type { ReactElement } from 'react';

import type { PublicProject } from '../../src/api-types';
import { Board } from './board';
import { GettingStarted } from './getting-started';
import { SetupStatus } from './setup/setup-status';

export function BoardPage({
  project,
  onOpenTicket,
  onNewTicket,
}: {
  project: PublicProject;
  onOpenTicket: (id: number) => void;
  onNewTicket: () => void;
}): ReactElement {
  return (
    <div className="flex h-full flex-col">
      <SetupStatus projectId={project.id} />
      <GettingStarted project={project} onNewTicket={onNewTicket} />
      <div className="min-h-0 flex-1">
        <Board project={project} onOpen={onOpenTicket} />
      </div>
    </div>
  );
}
