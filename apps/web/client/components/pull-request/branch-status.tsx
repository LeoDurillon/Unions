// The pull request's branch card: how far it is behind its base, Rebase, and the other branch operations.
// The worker polls GitHub for how far behind; the other operations open from the card's menu button.

import { useState, type ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { canRewrite, rewriteBlock } from '../../lib/pull-request/rewrite-block';
import { useTicketCommands } from '../../lib/ticket/use-ticket-commands';
import { HelpText } from '../ui/help-text';
import { Button, CARD_CLASS, ErrorText } from '../ui/ui';
import { hasMoreActions, MoreActions, moreActionsLabel } from './more-actions';

const HELP =
  'Git rebases the branch and the checks run, then it is force-pushed. The implementation agent is called only for conflicts or failing checks, and then the final review runs again. On failure the branch is left as it was.';

/** The card's first line: how far behind, up to date, or the branch while the worker has not checked. */
function Headline({ detail }: { detail: TicketDetail }): ReactElement {
  const { ticket, project } = detail;
  const base = <code>{ticket.baseBranch ?? project.config.baseBranch}</code>;
  if (ticket.behindBy === null) {
    return (
      <>
        Branch <code>{ticket.branch}</code>
      </>
    );
  }
  if (ticket.behindBy === 0) {
    return <>Up to date with {base}</>;
  }
  return (
    <>
      {ticket.behindBy === 1 ? '1 commit' : `${ticket.behindBy} commits`} behind {base}
    </>
  );
}

const BEHIND_CLASS =
  'space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30';

/** The branch's card itself: its state, the menu button, Rebase when behind, and the actions once opened. */
function BranchCard({ detail, more }: { detail: TicketDetail; more: boolean }): ReactElement {
  const { ticket } = detail;
  const { command } = useTicketCommands(ticket.id);
  const [open, setOpen] = useState(false);
  const behind = ticket.behindBy !== null && ticket.behindBy > 0;
  return (
    <section className={behind ? BEHIND_CLASS : `${CARD_CLASS} text-sm`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-semibold">
            <Headline detail={detail} />
          </p>
          {behind ? <HelpText>{HELP}</HelpText> : null}
        </div>
        {more ? (
          <Button
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
          >
            {moreActionsLabel(detail)} {open ? '▴' : '▾'}
          </Button>
        ) : null}
        {behind ? (
          <Button
            variant="primary"
            disabled={!canRewrite(detail) || command.isPending}
            title={rewriteBlock(detail) ?? undefined}
            onClick={() => {
              command.mutate({ type: 'rebase' });
            }}
          >
            Rebase
          </Button>
        ) : null}
      </div>
      <ErrorText error={command.error} />
      {open && more ? <MoreActions detail={detail} /> : null}
    </section>
  );
}

/**
 * The branch's card: how far it is behind its base (polled from GitHub by the worker), Rebase then, and the
 * menu button opening the other branch operations. A split ticket's stack panel has its own.
 */
export function BranchStatus({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket } = detail;
  if (ticket.prState === 'merged') {
    return (
      <p className="text-sm text-zinc-500">
        The pull request is merged: further changes need a new ticket.
      </p>
    );
  }
  const more = hasMoreActions(detail);
  if (ticket.branch === null || ticket.stack || (ticket.behindBy === null && !more)) {
    return null;
  }
  return <BranchCard detail={detail} more={more} />;
}
