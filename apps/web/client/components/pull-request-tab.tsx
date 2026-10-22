import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { PullRequestRow } from './pull-request-row';
import { BranchActions } from './pull-request/branch-actions';
import { CiChecks } from './pull-request/ci-checks';
import { Discussion } from './pull-request/discussion';
import { PrDescription } from './pull-request/pr-description';
import { SplitStack } from './pull-request/split-stack';
import { StackPanel } from './pull-request/stack-panel';

/**
 * The ticket's pull request: link it, its CI checks, keep its description current, then read its
 * GitHub discussion and pick what goes to the agent.
 */
export function PullRequestTab({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, project } = detail;
  return (
    <div className="space-y-4">
      <PullRequestRow ticket={ticket} project={project} />
      <StackPanel detail={detail} />
      <BranchActions detail={detail} />
      <SplitStack detail={detail} />
      {ticket.prNumber === null ? (
        <p className="text-sm text-zinc-500">
          Link the pull request to read its discussion here and import review comments.
        </p>
      ) : (
        <>
          {ticket.prState === 'merged' ? null : (
            <CiChecks key={ticket.prNumber} ticketId={ticket.id} />
          )}
          {ticket.prState === 'merged' ? null : <PrDescription ticketId={ticket.id} />}
          <Discussion key={ticket.prNumber} ticketId={ticket.id} />
        </>
      )}
    </div>
  );
}
