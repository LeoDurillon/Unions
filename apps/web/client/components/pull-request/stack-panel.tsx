// A split ticket's stack in its PR tab: each slice's pull request and state, what went wrong, and Restack.
import type { ReactElement } from 'react';

import type { StackView, TicketDetail } from '../../../src/api-types';
import { useTicketCommands } from '../../lib/use-ticket-commands';
import { Badge, Button, ErrorText } from '../ui';

const STATE_TONE = { open: 'green', merged: 'blue', closed: 'red' } as const;

function SliceRow({ slice }: { slice: StackView['slices'][number] }): ReactElement {
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="text-zinc-500">{slice.position}.</span>
      <span className="font-medium">{slice.title}</span>
      <code className="text-xs">{slice.branch}</code>
      {slice.prNumber === null ? null : <span>#{slice.prNumber}</span>}
      {slice.prState === null ? null : (
        <Badge tone={STATE_TONE[slice.prState]}>
          {slice.prState === 'merged' && slice.mergedInto
            ? `merged into ${slice.mergedInto}`
            : slice.prState}
        </Badge>
      )}
    </li>
  );
}

/** Out-of-order merges and closed slices: the stack cannot go on as it is. */
function Problems({ stack }: { stack: StackView }): ReactElement | null {
  const label = (position: number): string => {
    const slice = stack.slices.find((candidate) => candidate.position === position);
    return slice?.prNumber ? `#${slice.prNumber}` : `slice ${position}`;
  };
  const lines = [
    ...stack.outOfOrder.map(
      (position) =>
        `${label(position)} was merged into another slice's branch, not the base: its code is not in the base. Merge the slices below it, or revert it on GitHub.`,
    ),
    ...stack.closed.map(
      (position) => `${label(position)} was closed without a merge: the stack stops there.`,
    ),
  ];
  if (lines.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1 text-xs text-red-700 dark:text-red-400">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** Shown when the ticket is split: merge the slices from the bottom, on GitHub. */
export function StackPanel({ detail }: { detail: TicketDetail }): ReactElement | null {
  const { ticket } = detail;
  const { command } = useTicketCommands(ticket.id);
  const { stack } = ticket;
  if (!stack) {
    return null;
  }
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{stack.label}</span>
        {stack.restackable ? (
          <Button
            disabled={command.isPending}
            onClick={() => {
              command.mutate({ type: 'restack' });
            }}
          >
            Restack
          </Button>
        ) : null}
      </div>
      <ol className="space-y-1">
        {stack.slices.map((slice) => (
          <SliceRow key={slice.position} slice={slice} />
        ))}
      </ol>
      <Problems stack={stack} />
      <p className="text-xs text-zinc-500">
        Merge from the bottom on GitHub. When a slice merges, the rest of the stack is moved onto
        the base by git alone; if that stops on a conflict, Restack lets the implementation agent
        resolve it. The ticket is merged once every slice is in the base.
      </p>
      <ErrorText error={command.error} />
    </div>
  );
}
