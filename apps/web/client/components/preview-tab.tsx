import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { ContainerCommands } from './container-commands';
import { PreviewSection } from './preview-section';

/** Where a failure can go back to the agent: at the final review, or once done. */
function canRevise(phase: TicketDetail['ticket']['phase']): boolean {
  return (
    phase.kind === 'done' || (phase.kind === 'awaiting_approval' && phase.step === 'final_review')
  );
}

/** The ticket's Preview tab: the environment, its output, its end-to-end tests, and commands. */
export function PreviewTab({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, project } = detail;
  const target = { kind: 'ticket', ticketId: ticket.id } as const;
  return (
    <div className="space-y-4">
      <PreviewSection target={target} canRevise={canRevise(ticket.phase)} />
      <ContainerCommands
        target={target}
        scripts={project.config.scripts ?? []}
        intro={
          <>
            Runs in the ticket&apos;s workspace, in the repository, as the agent does (no GitHub
            credentials), with <code>PREVIEW_URL</code> while the preview runs. A typed command
            stops after 10 minutes.
          </>
        }
      />
    </div>
  );
}
