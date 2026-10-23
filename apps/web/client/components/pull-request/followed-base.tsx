// The notice that GitHub moved the pull request off its base: the next rebase leaves that base's commits behind.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/use-ticket-commands';
import { Button, ErrorText } from '../ui';
import { canRewrite } from './branch-status';

/** Rebase from the notice, for a branch up to date with its new base: the behind count offers none. */
function RebaseButton({ detail }: { detail: TicketDetail }): ReactElement {
  const { command } = useTicketCommands(detail.ticket.id);
  const allowed = canRewrite(detail);
  return (
    <div>
      <Button
        disabled={!allowed || command.isPending}
        title={allowed ? undefined : 'Available at the final review, or once done'}
        onClick={() => {
          command.mutate({ type: 'rebase' });
        }}
      >
        Rebase
      </Button>
      <ErrorText error={command.error} />
    </div>
  );
}

/** Shown from the moment the worker follows GitHub's new base until a rebase moved the branch. */
export function FollowedBase({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket, project } = detail;
  const left = ticket.leftBase;
  if (left === null || ticket.prState !== 'open') {
    return null;
  }
  const base = ticket.baseBranch ?? project.config.baseBranch;
  const what =
    left.prNumber === null ? 'is no longer the base on GitHub' : `was merged (#${left.prNumber})`;
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <p>
        <code>{left.branch}</code> {what}: the pull request now targets <code>{base}</code>, and so
        does this ticket. A rebase moves only this ticket&apos;s commits onto <code>{base}</code>,
        leaving those of <code>{left.branch}</code> behind.
      </p>
      {ticket.behindBy === 0 ? <RebaseButton detail={detail} /> : null}
    </div>
  );
}
