// The ticket's runs in the Overview tab: step, model, status and time, with what their agent calls used.
import type { ReactElement } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { stepTitle } from '../lib/labels';
import { useCustomAgentNames } from '../lib/use-custom-agents';
import { useTicketUsage } from '../lib/use-usage';
import { Badge } from './ui';
import { UsageTable, type UsageRow } from './usage/usage-table';

const MS_PER_SECOND = 1000;
const RUN_TONE = {
  running: 'blue',
  succeeded: 'green',
  failed: 'red',
  rate_limited: 'red',
} as const;
const COLUMNS = ['Run', 'Step', 'Model', 'Status', 'Time'];

type Run = TicketDetail['runs'][number];

function seconds(run: Run): string {
  return run.finishedAt === null
    ? '…'
    : `${Math.round((run.finishedAt - run.startedAt) / MS_PER_SECOND)}s`;
}

export function RunTable({
  ticketId,
  runs,
}: {
  ticketId: number;
  runs: TicketDetail['runs'];
}): ReactElement | null {
  const usage = useTicketUsage(ticketId);
  const names = useCustomAgentNames();
  const groups = usage.data?.groups ?? [];
  const rows: UsageRow[] = runs.map((run) => ({
    key: `run-${run.id}`,
    cells: [
      `#${run.id}`,
      stepTitle(run.step, names),
      run.model,
      <Badge key="status" tone={RUN_TONE[run.status]}>
        {run.status}
      </Badge>,
      seconds(run),
    ],
    group: groups.find((group) => group.runId === run.id),
  }));
  const side = groups.find((group) => group.key === 'side');
  if (side) {
    rows.push({
      key: 'side',
      cells: ['Other', 'Agent review, grouping, PR description', '', '', ''],
      group: side,
    });
  }
  if (rows.length === 0) {
    return null;
  }
  return <UsageTable columns={COLUMNS} rows={rows} total={usage.data?.total} />;
}
