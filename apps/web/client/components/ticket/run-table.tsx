// The ticket's runs in the Overview tab: step, model, status and time, with what their agent calls used.

import type { ReactElement } from 'react';

import type { TicketDetail } from '../../../src/api-types';
import { stepTitle } from '../../lib/board/labels';
import { formatDuration, runsDuration } from '../../lib/ui/duration';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';
import { useTicketUsage } from '../../lib/usage/use-usage';
import { Badge } from '../ui/ui';
import { UsageTable, type UsageRow } from '../usage/usage-table';

const RUN_TONE = {
  running: 'blue',
  succeeded: 'green',
  failed: 'red',
  rate_limited: 'red',
} as const;
const COLUMNS = ['Run', 'Step', 'Model', 'Status', 'Time'];

type Run = TicketDetail['runs'][number];

function took(run: Run): string {
  return run.finishedAt === null ? '…' : formatDuration(run.finishedAt - run.startedAt);
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
      took(run),
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
  return (
    <section className="space-y-2" aria-label="Runs">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Runs</h3>
        <span className="text-xs text-zinc-500">
          {runs.length} run{runs.length === 1 ? '' : 's'} · {formatDuration(runsDuration(runs))}
        </span>
      </div>
      <UsageTable columns={COLUMNS} rows={rows} total={usage.data?.total} />
    </section>
  );
}
