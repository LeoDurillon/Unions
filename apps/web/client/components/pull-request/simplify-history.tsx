// The Simplify history button: the implementation agent rewrites the branch's commits (a stack's slice by slice), the code unchanged.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/use-ticket-commands';
import { Button, ErrorText } from '../ui';
import { canRewrite } from './branch-status';

const HELP =
  "The implementation agent rewrites the branch's commits into fewer, clearer ones. The code must stay exactly the same, so the final review stands; the branch is then force-pushed. On failure it is left as it was.";
const STACK_HELP =
  "The implementation agent rewrites each slice's commits into fewer, clearer ones, never moving a change to another slice. Every slice must end with exactly the same code, so the final review stands; the stack is then force-pushed together. On failure it is left as it was.";

/** A stack's Simplify history, beside Rebase stack: its help is the tooltip. */
export function SimplifyStackButton({
  detail,
  busy,
  run,
}: {
  detail: TicketDetail;
  busy: boolean;
  run: () => void;
}): ReactElement {
  const restack = detail.ticket.stack?.restackable === true;
  const allowed = canRewrite(detail) && !restack;
  const why = restack
    ? 'Restack first: a slice was merged into the base'
    : 'Available at the final review, or once done';
  return (
    <Button disabled={!allowed || busy} title={allowed ? STACK_HELP : why} onClick={run}>
      Simplify history
    </Button>
  );
}

/** Shown while the pull request is open; usable at the final review or once done. */
export function SimplifyHistory({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket } = detail;
  const { command } = useTicketCommands(ticket.id);
  // A stack's button sits with its other actions (`SimplifyStackButton`).
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
      <p className="text-xs text-zinc-500">{HELP}</p>
      <ErrorText error={command.error} />
    </div>
  );
}
