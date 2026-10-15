// The ticket panel's overview tab: run status, details, and the buttons that act on the ticket.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { isBlocked, STEP_TITLES } from '../lib/labels';
import { useTicketCommands } from '../lib/use-ticket-commands';
import { RemoveTicket } from './remove-ticket';
import { TicketDescription } from './ticket-description';
import { TicketDetails } from './ticket-details';
import { Badge, Button, ErrorText } from './ui';

const MS_PER_SECOND = 1000;
const RUN_TONE = {
  running: 'blue',
  succeeded: 'green',
  failed: 'red',
  rate_limited: 'red',
} as const;

function RunTable({ runs }: { runs: TicketDetail['runs'] }): ReactElement | null {
  if (runs.length === 0) {
    return null;
  }
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-zinc-500">
        <tr>
          <th className="py-1">Run</th>
          <th>Step</th>
          <th>Model</th>
          <th>Status</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id} className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="py-1">#{run.id}</td>
            <td>{STEP_TITLES[run.step]}</td>
            <td>{run.model}</td>
            <td>
              <Badge tone={RUN_TONE[run.status]}>{run.status}</Badge>
            </td>
            <td>
              {run.finishedAt === null
                ? '…'
                : `${Math.round((run.finishedAt - run.startedAt) / MS_PER_SECOND)}s`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OverviewTab({
  detail,
  onOpenTicket,
  onRemoved,
  onOpenPreview,
}: {
  detail: TicketDetail;
  onOpenTicket: (id: number) => void;
  /** After a cancelled ticket is removed: the panel closes. */
  onRemoved: () => void;
  onOpenPreview: () => void;
}): ReactElement {
  const { ticket, runs } = detail;
  const blocked = isBlocked(ticket);
  const { command } = useTicketCommands(ticket.id);
  const { kind } = ticket.phase;
  const finished = kind === 'done' || kind === 'cancelled';

  return (
    <div className="space-y-4">
      <TicketDetails detail={detail} onOpenTicket={onOpenTicket} onOpenPreview={onOpenPreview} />
      <TicketDescription ticket={ticket} />
      <ErrorText error={command.error} />
      <div className="flex gap-2">
        {kind === 'backlog' ? (
          <Button
            variant="primary"
            disabled={command.isPending || blocked}
            title={blocked ? 'Waits for the parent ticket to be done' : undefined}
            onClick={() => {
              command.mutate({ type: 'start' });
            }}
          >
            Start
          </Button>
        ) : null}
        {kind === 'cancelled' ? <RemoveTicket ticketId={ticket.id} onRemoved={onRemoved} /> : null}
        {finished ? null : (
          <Button
            variant="danger"
            disabled={command.isPending}
            onClick={() => {
              command.mutate({ type: 'cancel' });
            }}
          >
            Cancel ticket
          </Button>
        )}
      </div>
      <RunTable runs={runs} />
    </div>
  );
}
