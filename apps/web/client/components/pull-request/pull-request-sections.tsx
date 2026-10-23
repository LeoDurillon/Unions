// The PR tab's sections about one pull request (the ticket's, or a slice's picked above them): CI checks, description, discussion.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { CiChecks } from './ci-checks';
import { Discussion } from './discussion';
import { PrDescription } from './pr-description';
import { SliceDescription } from './slice-description';
import { StackPrPicker } from './stack-pr-picker';

function Description({ detail, pr }: { detail: TicketDetail; pr: number }): ReactElement | null {
  const { ticket } = detail;
  if (pr !== ticket.prNumber) {
    return <SliceDescription ticketId={ticket.id} pr={pr} />;
  }
  return ticket.prState === 'merged' ? null : <PrDescription ticketId={ticket.id} />;
}

/** The picked pull request's CI checks (not once merged), description and discussion. */
export function PullRequestSections({
  detail,
  pr,
  onPick,
}: {
  detail: TicketDetail;
  pr: number;
  onPick: (pr: number) => void;
}): ReactElement {
  const { ticket } = detail;
  const slice = ticket.stack?.slices.find((candidate) => candidate.prNumber === pr);
  const state = pr === ticket.prNumber ? ticket.prState : slice?.prState;
  return (
    <>
      {ticket.stack ? <StackPrPicker stack={ticket.stack} value={pr} onChange={onPick} /> : null}
      {state === 'merged' ? null : <CiChecks key={`ci-${pr}`} ticketId={ticket.id} pr={pr} />}
      <Description detail={detail} pr={pr} />
      <Discussion key={`discussion-${pr}`} ticketId={ticket.id} pr={pr} />
    </>
  );
}
