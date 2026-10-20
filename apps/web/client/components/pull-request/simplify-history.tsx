// The Simplify history button: the implementation agent rewrites the branch&apos;s commits, the code unchanged.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/use-ticket-commands';
import { Button, ErrorText } from '../ui';
import { canRewrite } from './branch-status';

/** Shown while the pull request is open; usable at the final review or once done. */
export function SimplifyHistory({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket } = detail;
  const { command } = useTicketCommands(ticket.id);
  // A split ticket's history is its slices: a new split replaces it.
  if (ticket.branch === null || ticket.prState !== 'open' || ticket.stack) {
    return null;
  }
  const allowed = canRewrite(detail);
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Commit history of <code>{ticket.branch}</code>
        </span>
        <Button
          disabled={!allowed || command.isPending}
          title={allowed ? undefined : 'Available at the final review, or once done'}
          onClick={() => {
            command.mutate({ type: 'simplify' });
          }}
        >
          Simplify history
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        The implementation agent rewrites the branch&apos;s commits into fewer, clearer ones. The
        code must stay exactly the same, so the final review stands; the branch is then
        force-pushed. On failure it is left as it was.
      </p>
      <ErrorText error={command.error} />
    </div>
  );
}
