// The notice that the branch moved on GitHub since Union pushed it, and the button that resyncs Union's copy onto it.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { useBranchResync } from '../../lib/use-branch-resync';
import { HelpText } from '../help-text';
import { Button, ErrorText } from '../ui';

const SHORT_SHA = 7;

const HELP =
  'Union fetches the branch from GitHub and puts its copy on it, so the next rebase, revision or review starts from there. Nothing is pushed and no agent runs. If Union holds work it never pushed, nothing is changed and the reason shows here.';

/** Shown from the poll that saw the move until a resync, or until Union pushes again. */
export function BranchMoved({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket } = detail;
  const moved = ticket.remoteMoved;
  const { resync, busy, error } = useBranchResync(ticket.id);
  if (moved === null || ticket.branch === null || ticket.prState !== 'open') {
    return null;
  }
  const change = (
    <>
      (<code>{moved.from.slice(0, SHORT_SHA)}</code> → <code>{moved.to.slice(0, SHORT_SHA)}</code>)
    </>
  );
  return (
    <div className="space-y-2 rounded-md border border-amber-300 p-3 text-sm dark:border-amber-900">
      <p>
        {moved.kind === 'ahead' ? (
          <>
            New commits were pushed to <code>{ticket.branch}</code> on GitHub {change}.
          </>
        ) : (
          <>
            <code>{ticket.branch}</code> was rewritten on GitHub {change}.
          </>
        )}{' '}
        Union&apos;s copy is out of date: resync it before a rebase or a revision.
      </p>
      <Button disabled={busy} onClick={resync}>
        {busy ? 'Resyncing…' : 'Resync from GitHub'}
      </Button>
      <HelpText>{HELP}</HelpText>
      <ErrorText error={error} />
    </div>
  );
}
