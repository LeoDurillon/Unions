// What can be done to a split ticket's whole stack: how far it is behind its base, Rebase stack, Restack, Split again, Rewrite all descriptions.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/use-ticket-commands';
import { Button, ErrorText } from '../ui';
import { canRewrite } from './branch-status';
import { RewriteDescriptions } from './rewrite-descriptions';

const NOT_YET = 'Available at the final review, or once done';

/** The top slice's distance to the base is the whole stack's: it holds every slice below. */
function Behind({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket, project } = detail;
  if (ticket.behindBy === null) {
    return null;
  }
  const base = <code>{ticket.baseBranch ?? project.config.baseBranch}</code>;
  if (ticket.behindBy === 0) {
    return <span className="text-zinc-500">Up to date with {base}</span>;
  }
  const commits = ticket.behindBy === 1 ? '1 commit' : `${ticket.behindBy} commits`;
  return (
    <span className="text-amber-700 dark:text-amber-400">
      {commits} behind {base}
    </span>
  );
}

export function StackActions({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket } = detail;
  const { command } = useTicketCommands(ticket.id);
  const { stack } = ticket;
  if (!stack || ticket.prState !== 'open') {
    return null;
  }
  const allowed = canRewrite(detail);
  const busy = command.isPending;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Behind detail={detail} />
        <span className="grow" />
        {stack.restackable ? (
          <Button
            disabled={busy}
            onClick={() => {
              command.mutate({ type: 'restack' });
            }}
          >
            Restack
          </Button>
        ) : null}
        {ticket.behindBy ? (
          <Button
            disabled={!allowed || busy}
            title={allowed ? undefined : NOT_YET}
            onClick={() => {
              command.mutate({ type: 'rebase' });
            }}
          >
            Rebase stack
          </Button>
        ) : null}
        {detail.project.config.stacks === true ? (
          <Button
            disabled={!allowed || busy}
            title={allowed ? 'An agent plans new slices; the current stack is replaced' : NOT_YET}
            onClick={() => {
              command.mutate({ type: 'split' });
            }}
          >
            Split again
          </Button>
        ) : null}
      </div>
      {ticket.prNumber === null ? null : (
        <RewriteDescriptions detail={detail} pr={ticket.prNumber} />
      )}
      <ErrorText error={command.error} />
    </div>
  );
}
