import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { PreviewSection } from './preview-section';

/** Where a failure can go back to the agent: at the final review, or once done. */
function canRevise(phase: TicketDetail['ticket']['phase']): boolean {
  return (
    phase.kind === 'done' || (phase.kind === 'awaiting_approval' && phase.step === 'final_review')
  );
}

/** The ticket's Preview tab: the environment, its output and its end-to-end tests. */
export function PreviewTab({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket } = detail;
  return <PreviewSection ticketId={ticket.id} canRevise={canRevise(ticket.phase)} />;
}
