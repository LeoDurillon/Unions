// The ticket's pull request: link it, its CI checks, keep its description current, then read its
// GitHub discussion and pick what goes to the agent.
import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { PullRequestRow } from './pull-request-row';
import { BranchActions } from './pull-request/branch-actions';
import { PullRequestSections } from './pull-request/pull-request-sections';
import { SplitStack } from './pull-request/split-stack';
import { StackPanel } from './pull-request/stack-panel';
import { stackPullRequests } from './pull-request/stack-pr-picker';

/** The picked slice's pull request while it is still in the stack, else the ticket's own. */
function usePickedPullRequest(detail: TicketDetail): [number | null, (pr: number) => void] {
  const [picked, setPicked] = useState<number | null>(null);
  const { ticket } = detail;
  const inStack = picked !== null && stackPullRequests(ticket.stack).includes(picked);
  return [inStack ? picked : ticket.prNumber, setPicked];
}

/**
 * The ticket's pull request: link it, its CI checks, keep its description current, then read its
 * GitHub discussion and pick what goes to the agent. A split ticket's tab reads any slice's.
 */
export function PullRequestTab({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, project } = detail;
  const [pr, setPr] = usePickedPullRequest(detail);
  return (
    <div className="space-y-4">
      <PullRequestRow ticket={ticket} project={project} />
      <StackPanel detail={detail} shown={pr} />
      <BranchActions detail={detail} />
      <SplitStack detail={detail} />
      {pr === null ? (
        <p className="text-sm text-zinc-500">
          Link the pull request to read its discussion here and import review comments.
        </p>
      ) : (
        <PullRequestSections detail={detail} pr={pr} onPick={setPr} />
      )}
    </div>
  );
}
