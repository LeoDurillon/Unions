// What the event rules did lately, as a table: when, status, rule and ticket, then what it set or why it failed.
import { useQuery } from '@tanstack/react-query';
import type { NotionUser } from '@union/core';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import type { DeliveryView } from '../../../src/event-api-types';
import { eventRulesApi } from '../../lib/event-rules-api';
import { useNotionUsers } from '../../lib/use-notion-users';
import { Badge } from '../ui';

const DELIVERIES_POLL_MS = 10_000;
const STATUS_TONES = {
  pending: 'blue',
  succeeded: 'green',
  failed: 'red',
  skipped: 'neutral',
} as const;
const COLUMNS = 'grid grid-cols-[10rem_6rem_minmax(0,14rem)_minmax(0,1fr)] gap-x-3';

/** The detail with each Notion member's id replaced by their name (a person property stores ids). */
function withNames(detail: string, users: NotionUser[]): string {
  return users.reduce((text, user) => text.replaceAll(user.id, user.name), detail);
}

function DeliveryRow({
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
          {new Date(delivery.createdAt).toLocaleString()}
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

function DeliveryList({ projectId }: { projectId: number }): ReactElement {
  const deliveries = useQuery({
    queryKey: ['event-deliveries', projectId],
    queryFn: () => eventRulesApi.deliveries(projectId),
    refetchInterval: DELIVERIES_POLL_MS,
  });
  const rows = deliveries.data ?? [];
  const users =
    useNotionUsers(
      projectId,
      rows.some((row) => row.detail !== null),
    ).data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Nothing yet: rules apply to what happens from now on.</p>
    );
  }
  return (
    <div>
      <div
        className={`${COLUMNS} border-b border-zinc-200 pb-1 text-xs font-medium text-zinc-500 dark:border-zinc-800`}
      >
        <span>When</span>
        <span>Status</span>
        <span>Rule</span>
        <span>Ticket</span>
      </div>
      <ul>
        {rows.map((delivery) => (
          <DeliveryRow key={delivery.id} delivery={delivery} users={users} />
        ))}
      </ul>
    </div>
  );
}

/** What the rules did lately: each update or comment, and why one failed. */
export function EventActivitySection({ project }: { project: PublicProject }): ReactElement {
  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-500">
        The latest Notion updates and GitHub comments the event rules made, newest first.
      </p>
      <DeliveryList projectId={project.id} />
    </section>
  );
}
