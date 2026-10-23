// The PR tab's sections about one pull request, the same for the ticket's and a slice's picked above them: CI checks, description, discussion.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { CiChecks } from './ci-checks';
import { Discussion } from './discussion';
import { PrDescription, type RewriteFrom } from './pr-description';
import { StackPrPicker } from './stack-pr-picker';

function rewriteFrom(state: string | null | undefined, split: boolean): RewriteFrom {
  if (state === 'merged') {
    return null;
  }
  return split ? 'stack' : 'here';
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
      <PrDescription
        key={`description-${pr}`}
        ticketId={ticket.id}
        pr={pr}
        from={rewriteFrom(state, ticket.stack !== null && ticket.stack !== undefined)}
      />
      <Discussion key={`discussion-${pr}`} ticketId={ticket.id} pr={pr} />
    </>
  );
}
