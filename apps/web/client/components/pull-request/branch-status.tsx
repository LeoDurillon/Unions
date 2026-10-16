import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/use-ticket-commands';
import { Button, ErrorText } from '../ui';

/**
 * Where the branch can be rewritten (a rebase, a simpler history): the ticket waits on its final
 * review, or is done with the PR open.
 */
export function canRewrite(detail: TicketDetail): boolean {
  const { phase } = detail.ticket;
  return (
    phase.kind === 'done' || (phase.kind === 'awaiting_approval' && phase.step === 'final_review')
  );
}

/**
 * How far the PR's branch is behind its base (polled from GitHub by the worker) and the Rebase
 * button. Nothing shows until the worker has checked, or once the PR is closed or merged.
 */
export function BranchStatus({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket, project } = detail;
  const { command } = useTicketCommands(ticket.id);
  if (ticket.prState === 'merged') {
    return (
      <p className="text-sm text-zinc-500">
        The pull request is merged: further changes need a new ticket.
      </p>
    );
  }
  if (ticket.behindBy === null || ticket.branch === null) {
    return null;
  }
  const base = ticket.baseBranch ?? project.config.baseBranch;
  if (ticket.behindBy === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Up to date with <code>{base}</code>.
      </p>
    );
  }
  const commits = ticket.behindBy === 1 ? '1 commit' : `${ticket.behindBy} commits`;
  return (
    <div className="space-y-2 rounded-md border border-amber-300 p-3 text-sm dark:border-amber-900">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          <code>{ticket.branch}</code> is {commits} behind <code>{base}</code>.
        </span>
        <Button
          disabled={!canRewrite(detail) || command.isPending}
          title={canRewrite(detail) ? undefined : 'Available at the final review, or once done'}
          onClick={() => {
            command.mutate({ type: 'rebase' });
          }}
        >
          Rebase
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        The implementation agent rebases the branch and resolves conflicts, the checks run, then the
        branch is force-pushed and the final review runs again. On failure the branch is left as it
        was.
      </p>
      <ErrorText error={command.error} />
    </div>
  );
}
