// A board card's top line: its issue and pull request numbers, and its flow's name when it is not the full one.
import { flowName, resolveFlow } from '@union/core/flows';
import { FULL_FLOW } from '@union/core/states';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';

/** `#1684 · PR #1686`, and the flow's name on the right when it is not the full pipeline. */
export function CardMeta({
  ticket,
  config,
}: {
  ticket: TicketSummary;
  config?: PublicProject['config'];
}): ReactElement {
  const flow = config ? resolveFlow(ticket, config) : null;
  const short = config && flow && flow.length !== FULL_FLOW.length ? flowName(flow, config) : null;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
      <span>{ticket.issueNumber === null ? 'not on GitHub yet' : `#${ticket.issueNumber}`}</span>
      {ticket.prNumber === null ? null : <span>· PR #{ticket.prNumber}</span>}
      {short ? (
        <span className="ml-auto rounded-full border border-zinc-200 px-1.5 font-sans text-[10.5px] dark:border-zinc-700">
          {short}
        </span>
      ) : null}
    </div>
  );
}
