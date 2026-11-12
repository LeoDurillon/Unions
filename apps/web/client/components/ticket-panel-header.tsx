// The ticket panel's top bar: where the ticket lives (repository, issue, pull request) and its
// actions. The actions are the way to the next ticket that needs the user, Investigate, Review
// changes, the ⋯ menu and Close.
import type { ReactElement } from 'react';

import type { TicketDetail, TicketSummary } from '../../src/api-types';
import { investigateTicket } from '../lib/investigate-ticket';
import { TicketMenu } from './ticket-menu';
import type { NeedingYou } from './ticket-panel-keys';
import { Button, CloseButton } from './ui';

const CRUMB_LINK = 'text-indigo-600 hover:underline dark:text-indigo-400';

/** The final review waits for the user: reading the changes is what comes next. */
function waitsForCodeReview(detail: TicketDetail): boolean {
  const { phase } = detail.ticket;
  return phase.kind === 'awaiting_approval' && phase.step === 'final_review';
}

function Crumb({ href, children }: { href: string; children: string }): ReactElement {
  return (
    <>
      <span className="text-zinc-300 dark:text-zinc-700">/</span>
      <a className={CRUMB_LINK} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    </>
  );
}

/** `owner/repo / #12 / PR #34`, the issue and the pull request linked to GitHub. */
function Breadcrumb({ detail }: { detail: TicketDetail | undefined }): ReactElement {
  if (!detail) {
    return <span className="flex-1 text-xs text-zinc-500">Loading…</span>;
  }
  const { project, ticket } = detail;
  const repo = `https://github.com/${project.owner}/${project.repo}`;
  return (
    <nav
      aria-label="Where the ticket lives"
      className="flex min-w-0 flex-1 items-center gap-2 font-mono text-xs text-zinc-500"
    >
      <span className="truncate">
        {project.owner}/{project.repo}
      </span>
      {ticket.issueNumber === null ? null : (
        <Crumb href={`${repo}/issues/${ticket.issueNumber}`}>{`#${ticket.issueNumber}`}</Crumb>
      )}
      {ticket.prNumber === null ? null : (
        <Crumb href={`${repo}/pull/${ticket.prNumber}`}>{`PR #${ticket.prNumber}`}</Crumb>
      )}
    </nav>
  );
}

/** The next ticket that needs the user (`n`), with how many others do; none when no other does. */
function NextNeeding({
  next,
  others,
  onOpen,
}: {
  next: TicketSummary | null;
  others: number;
  onOpen: (id: number) => void;
}): ReactElement | null {
  if (!next) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      className="whitespace-nowrap"
      title={`Open “${next.title}”, the next ticket that needs you (n; p goes back)`}
      onClick={() => {
        onOpen(next.id);
      }}
    >
      Next needing you
      <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
        {others}
      </span>
    </Button>
  );
}

export function TicketPanelHeader({
  detail,
  onReview,
  onClose,
  onRemoved,
  needing,
  onOpenTicket,
}: {
  detail: TicketDetail | undefined;
  onReview: () => void;
  onClose: () => void;
  /** After a cancelled ticket is removed from the ⋯ menu: the panel closes. */
  onRemoved: () => void;
  /** The next ticket on the board that needs the user, and how many other than this one do. */
  needing: NeedingYou;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  return (
    <header className="flex items-center gap-2 px-6 pt-4 pb-2">
      <Breadcrumb detail={detail} />
      <NextNeeding next={needing.next} others={needing.others} onOpen={onOpenTicket} />
      {detail ? (
        <Button
          className="whitespace-nowrap"
          title="Run an investigation in this ticket's workspace, as its agent left it"
          onClick={() => {
            investigateTicket(detail.ticket.id);
          }}
        >
          Investigate
        </Button>
      ) : null}
      {detail?.ticket.branch ? (
        <Button
          className="whitespace-nowrap"
          variant={waitsForCodeReview(detail) ? 'primary' : 'secondary'}
          title="Review the changes (r)"
          onClick={onReview}
        >
          Review changes
        </Button>
      ) : null}
      {detail ? <TicketMenu detail={detail} onRemoved={onRemoved} /> : null}
      <CloseButton onClick={onClose} />
    </header>
  );
}
