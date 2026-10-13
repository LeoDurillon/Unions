import { useQuery } from '@tanstack/react-query';
import type { EventRule, NotionSchema } from '@union/core';
import { BOARD_LABELS, TRIGGER_LABELS, type EventTrigger } from '@union/core/event-rules';
import type { ReactElement } from 'react';

import type { DeliveryView } from '../../../src/event-api-types';
import { eventRulesApi } from '../../lib/event-rules-api';
import { STEP_TITLES } from '../../lib/labels';
import { Badge, Button } from '../ui';
import { PeopleNames } from './people-field';

const DELIVERIES_POLL_MS = 10_000;
const STATUS_TONES = {
  pending: 'blue',
  succeeded: 'green',
  failed: 'red',
  skipped: 'neutral',
} as const;

export function triggerText(trigger: EventTrigger): string {
  if (trigger.kind === 'board_status') {
    return `The ticket moves to ${BOARD_LABELS[trigger.status]}`;
  }
  if (trigger.kind === 'awaiting_approval' && trigger.step !== null) {
    return `${STEP_TITLES[trigger.step]} waits for your approval`;
  }
  return TRIGGER_LABELS[trigger.kind];
}

/** One rule: when, then, and its switches. */
export function RuleRow({
  projectId,
  rule,
  notion,
  onToggle,
  onEdit,
  onDelete,
}: {
  projectId: number;
  rule: EventRule;
  notion: NotionSchema | null;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): ReactElement {
  const property = notion?.properties.find((candidate) => candidate.id === rule.action.propertyId);
  return (
    <li className="flex items-start gap-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p className="font-medium">
          {rule.name} {rule.enabled ? null : <Badge tone="neutral">off</Badge>}
        </p>
        <p className="text-zinc-500">
          When: {triggerText(rule.trigger)} → set{' '}
          {property ? (
            <span className="font-medium">{property.name}</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">a property no longer in Notion</span>
          )}{' '}
          to{' '}
          {property?.type === 'people' ? (
            <PeopleNames projectId={projectId} value={rule.action.value} />
          ) : (
            <code className="font-mono">{rule.action.value || '(empty)'}</code>
          )}
        </p>
      </div>
      <Button onClick={onToggle}>{rule.enabled ? 'Turn off' : 'Turn on'}</Button>
      <Button onClick={onEdit}>Edit</Button>
      <Button onClick={onDelete}>Delete</Button>
    </li>
  );
}

function DeliveryRow({ delivery }: { delivery: DeliveryView }): ReactElement {
  return (
    <li className="space-y-0.5 border-b border-zinc-200 py-1.5 text-sm last:border-b-0 dark:border-zinc-800">
      <p className="flex items-center gap-2">
        <Badge tone={STATUS_TONES[delivery.status]}>{delivery.status}</Badge>
        <span className="font-medium">{delivery.ruleName}</span>
        <span className="min-w-0 truncate text-zinc-500">
          {delivery.ticketTitle ?? 'no ticket'}
        </span>
        <span className="ml-auto text-xs whitespace-nowrap text-zinc-500">
          {new Date(delivery.createdAt).toLocaleString()}
        </span>
      </p>
      {delivery.detail ? (
        <p className="text-zinc-600 dark:text-zinc-400">{delivery.detail}</p>
      ) : null}
      {delivery.error ? (
        <p className="text-red-600 dark:text-red-400">
          {delivery.error}
          {delivery.status === 'pending' ? ` (attempt ${delivery.attempts}, trying again)` : ''}
        </p>
      ) : null}
    </li>
  );
}

/** What the rules did lately, newest first. */
export function DeliveryList({ projectId }: { projectId: number }): ReactElement {
  const deliveries = useQuery({
    queryKey: ['event-deliveries', projectId],
    queryFn: () => eventRulesApi.deliveries(projectId),
    refetchInterval: DELIVERIES_POLL_MS,
  });
  const rows = deliveries.data ?? [];
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Recent activity</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing yet: rules apply to what happens from now on.
        </p>
      ) : (
        <ul>
          {rows.map((delivery) => (
            <DeliveryRow key={delivery.id} delivery={delivery} />
          ))}
        </ul>
      )}
    </section>
  );
}
