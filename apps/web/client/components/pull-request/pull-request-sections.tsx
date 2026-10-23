// The PR tab's sections about one pull request, the same for the ticket's and a slice's picked above them: CI checks, description, discussion.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { CiChecks } from './ci-checks';
import { Discussion } from './discussion';
import { PrDescription, type RewriteScope } from './pr-description';
import { StackPrPicker } from './stack-pr-picker';

/** How many pull requests a rewrite covers: each open slice's of a split ticket, else one. */
function rewriteScope(detail: TicketDetail): RewriteScope {
  const open = (detail.ticket.stack?.slices ?? []).filter(
    (slice) => slice.prNumber !== null && slice.prState !== 'merged',
  );
  return { pullRequests: Math.max(open.length, 1) };
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
        scope={state === 'merged' ? null : rewriteScope(detail)}
      />
      <Discussion key={`discussion-${pr}`} ticketId={ticket.id} pr={pr} />
    </>
  );
}
