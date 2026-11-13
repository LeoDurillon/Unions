// Above the event rules: each connected tracker's columns or fields as Union last read them, and reading them
// again.

import type { ReactElement } from 'react';

import type { EventRulesResponse } from '../../../src/event-api-types';
import { TRACKER_RULE_EDITORS } from '../integrations/tracker-rule-editors';

/** Each connected tracker's columns or fields, in a card; with no tracker connected, nothing. */
export function TrackerBars({
  projectId,
  data,
  onRefreshed,
}: {
  projectId: number;
  data: EventRulesResponse | undefined;
  onRefreshed: () => Promise<void>;
}): ReactElement | null {
  if (!data || data.trackers.length === 0) {
    return null;
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Trackers&apos; columns</h3>
      <p className="text-xs text-zinc-500">
        What the rules can set, as Union last read it. Read it again after changing the columns.
      </p>
      {data.trackers.map(({ kind }) => {
        const { Bar } = TRACKER_RULE_EDITORS[kind];
        return <Bar key={kind} projectId={projectId} data={data} onRefreshed={onRefreshed} />;
      })}
    </section>
  );
}
