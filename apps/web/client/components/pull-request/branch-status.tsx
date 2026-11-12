// How far the PR's branch is behind its base (polled from GitHub by the worker) and the Rebase
// button.

import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { HelpText } from '../ui/help-text';
import { Button, ErrorText } from '../ui/ui';

const HELP =
  'Git rebases the branch and the checks run, then it is force-pushed. The implementation agent is called only for conflicts or failing checks, and then the final review runs again. On failure the branch is left as it was.';

/**
 * Why the branch cannot be rewritten now (a rebase, a simpler history, a split, a new target); null
 * when it can: the ticket waits on its final review, or is done with the PR open, and the branch on
 * GitHub is the one Union pushed.
 */
export function rewriteBlock(detail: TicketDetail): string | null {
  const { phase, remoteMoved } = detail.ticket;
  if (remoteMoved !== null) {
    return 'The branch moved on GitHub: resync it first';
  }
  const ready =
    phase.kind === 'done' || (phase.kind === 'awaiting_approval' && phase.step === 'final_review');
  return ready ? null : 'Available at the final review, or once done';
}

export function canRewrite(detail: TicketDetail): boolean {
  return rewriteBlock(detail) === null;
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
  // A split ticket's stack panel shows how far the stack is behind, and its Rebase.
  if (ticket.behindBy === null || ticket.branch === null || ticket.stack) {
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
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          <code>{ticket.branch}</code> is {commits} behind <code>{base}</code>.
        </span>
        <Button
          disabled={!canRewrite(detail) || command.isPending}
          title={rewriteBlock(detail) ?? undefined}
          onClick={() => {
            command.mutate({ type: 'rebase' });
          }}
        >
          Rebase
        </Button>
      </div>
      <HelpText>{HELP}</HelpText>
      <ErrorText error={command.error} />
    </div>
  );
}
