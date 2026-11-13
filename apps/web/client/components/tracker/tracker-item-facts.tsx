// An item's facts under its title on a tracker card: key, type, status, assignee, last change.

import type { TrackerItemFacts, TrackerStage } from '@union/core';
import { integrationKind, type IntegrationKindName } from '@union/core/integration-kinds';
import type { ReactElement } from 'react';

import type { Tone } from '../../lib/board/labels';
import { timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { Badge } from '../ui/ui';

const STAGE_TONES: Record<TrackerStage, Tone> = {
  new: 'neutral',
  indeterminate: 'blue',
  done: 'green',
};

function Status({ status }: { status: NonNullable<TrackerItemFacts['status']> }): ReactElement {
  if (status.field !== null) {
    return (
      <span>
        · {status.field}{' '}
        <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{status.name}</strong>
      </span>
    );
  }
  return <Badge tone={status.stage ? STAGE_TONES[status.stage] : 'neutral'}>{status.name}</Badge>;
}

/** `ABC-1 · Story · In Review · Ada Lovelace · updated 2 h ago`, what the tracker did not give left out. */
export function TrackerItemFactsLine({
  kind,
  facts,
}: {
  kind: IntegrationKindName;
  facts: TrackerItemFacts;
}): ReactElement {
  const now = useNow(false);
  const { label, itemLabel, changedLabel } = integrationKind(kind);
  const changed = facts.changedAt
    ? `${changedLabel} ${timeAgo(Date.parse(facts.changedAt), now)}`
    : null;
  const tail = [
    facts.assignee === undefined ? null : (facts.assignee ?? 'Unassigned'),
    changed,
  ].filter((part) => part !== null);
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-zinc-500">
      <span className={facts.key ? 'font-medium text-zinc-700 dark:text-zinc-300' : undefined}>
        {facts.key ?? `${label} ${itemLabel}`}
      </span>
      {facts.type ? <span>· {facts.type}</span> : null}
      {facts.status ? <Status status={facts.status} /> : null}
      {tail.length > 0 ? (
        // A badge is its own separator; text after text takes a dot.
        <span className="truncate">
          {facts.status?.field === null ? '' : '· '}
          {tail.join(' · ')}
        </span>
      ) : null}
    </p>
  );
}
