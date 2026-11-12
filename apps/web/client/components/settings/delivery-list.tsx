// What the event rules did lately, as a table: when, status, rule and ticket, then what it set or why it failed.

import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useNotionUsers } from '../../lib/integrations/use-notion-users';
import { eventRulesApi } from '../../lib/settings/event-rules-api';
import { Loading, SkeletonRows } from '../ui/skeleton';
import { COLUMNS, DeliveryRow } from './delivery-row';
import { SettingsIntro } from './settings-intro';

const DELIVERIES_POLL_MS = 10_000;
const LOADING_ROWS = 9;
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
  if (deliveries.isPending) {
    return (
      <Loading
        label="Reading the event activity"
        className="divide-y divide-zinc-200 dark:divide-zinc-800"
      >
        <SkeletonRows count={LOADING_ROWS} columns={COLUMNS} cells={3} rowClassName="py-2.5" />
      </Loading>
    );
  }
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
    <>
      <SettingsIntro>
        The latest Notion updates and GitHub comments the event rules made, newest first.
      </SettingsIntro>
      <section>
        <DeliveryList projectId={project.id} />
      </section>
    </>
  );
}
