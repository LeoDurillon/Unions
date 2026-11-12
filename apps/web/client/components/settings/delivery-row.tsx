// One row of Event activity: when, status, rule and ticket, then what it set or why it failed.

import type { NotionUser } from '@union/core';
import type { ReactElement } from 'react';

import type { DeliveryView } from '../../../src/event-api-types';
import { formatWhen } from '../../lib/ui/relative-time';
import { Badge } from '../ui/ui';

const STATUS_TONES = {
  pending: 'blue',
  succeeded: 'green',
  failed: 'red',
  skipped: 'neutral',
} as const;
/** The table's columns, for its header and its placeholder rows too. */
export const COLUMNS = 'grid grid-cols-[10rem_6rem_minmax(0,14rem)_minmax(0,1fr)] gap-x-3';

/** The detail with each Notion member's id replaced by their name (a person property stores ids). */
function withNames(detail: string, users: NotionUser[]): string {
  return users.reduce((text, user) => text.replaceAll(user.id, user.name), detail);
}

/** One thing a rule did: when, its status, the rule and the ticket, then what it set or why it failed. */
export function DeliveryRow({
  delivery,
  users,
}: {
  delivery: DeliveryView;
  users: NotionUser[];
}): ReactElement {
  const ticket = delivery.ticketTitle ?? 'no ticket';
  return (
    <li className="border-b border-zinc-200 py-2 text-sm last:border-b-0 dark:border-zinc-800">
      <div className={`${COLUMNS} items-center`}>
        <span className="text-xs whitespace-nowrap text-zinc-500">
          {formatWhen(delivery.createdAt)}
        </span>
        <span>
          <Badge tone={STATUS_TONES[delivery.status]}>{delivery.status}</Badge>
        </span>
        <span className="truncate font-medium" title={delivery.ruleName}>
          {delivery.ruleName}
        </span>
        <span className="truncate text-zinc-500" title={ticket}>
          {ticket}
        </span>
      </div>
      {delivery.detail ? (
        <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
          {withNames(delivery.detail, users)}
        </p>
      ) : null}
      {delivery.error ? (
        <p className="mt-0.5 text-red-600 dark:text-red-400">
          {delivery.error}
          {delivery.status === 'pending' ? ` (attempt ${delivery.attempts}, trying again)` : ''}
        </p>
      ) : null}
    </li>
  );
}
