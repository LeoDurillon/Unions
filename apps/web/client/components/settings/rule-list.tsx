// One rule: when, then, and its switches.
import type { EventRule, NotionSchema } from '@union/core';
import {
  BOARD_LABELS,
  TRIGGER_LABELS,
  VERDICT_LABELS,
  type EventTrigger,
} from '@union/core/event-rules';
import type { ReactElement } from 'react';

import { stepTitle } from '../../lib/labels';
import { Badge, Button } from '../ui';
import { ActionText } from './rule-action-text';

function triggerText(trigger: EventTrigger): string {
  if (trigger.kind === 'board_status') {
    return `The ticket moves to ${BOARD_LABELS[trigger.status]}`;
  }
  if (trigger.kind === 'awaiting_approval' && trigger.step !== null) {
    return `${stepTitle(trigger.step)} waits for your approval`;
  }
  if (trigger.kind === 'pull_request_reviewed' && trigger.verdict !== null) {
    return `You post a review of its pull request: ${VERDICT_LABELS[trigger.verdict]}`;
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
  return (
    <li className="flex items-start gap-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p className="font-medium">
          {rule.name} {rule.enabled ? null : <Badge tone="neutral">off</Badge>}
        </p>
        <p className="text-zinc-500">
          When: {triggerText(rule.trigger)} →{' '}
          <ActionText projectId={projectId} notion={notion} action={rule.action} />
        </p>
      </div>
      <Button onClick={onToggle}>{rule.enabled ? 'Turn off' : 'Turn on'}</Button>
      <Button onClick={onEdit}>Edit</Button>
      <Button onClick={onDelete}>Delete</Button>
    </li>
  );
}
