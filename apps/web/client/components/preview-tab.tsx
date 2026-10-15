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
  const { ticket } = detail;
  return (
    <div className="space-y-4">
      <PreviewSection ticketId={ticket.id} canRevise={canRevise(ticket.phase)} />
      <ContainerCommands ticketId={ticket.id} />
    </div>
  );
}
