// The Split into a stack button: an agent plans slices of the spec, then the branch becomes a stack of pull requests.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/use-ticket-commands';
import { Button, ErrorText } from '../ui';
import { canRewrite } from './branch-status';

/** Shown while the pull request is open, on projects that turned stacks on. */
export function SplitStack({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket, project } = detail;
  const { command } = useTicketCommands(ticket.id);
  // Once split, Split again is in the stack panel.
  if (
    project.config.stacks !== true ||
    ticket.branch === null ||
    ticket.prState !== 'open' ||
    ticket.stack
  ) {
    return null;
  }
  const allowed = canRewrite(detail);
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <span>Too big to review in one piece?</span>
        <Button
          disabled={!allowed || command.isPending}
          title={allowed ? undefined : 'Available at the final review, or once done'}
          onClick={() => {
            command.mutate({ type: 'split' });
          }}
        >
          Split into a stack
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        An agent proposes slices of the spec, each one a pull request on the one below; you edit and
        approve the plan in its Worker tab. The implementation agent then rewrites the commits into
        the slices, the code unchanged, and the stack is pushed and opened on GitHub.
      </p>
      <ErrorText error={command.error} />
    </div>
  );
}
