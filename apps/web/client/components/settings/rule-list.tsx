// One rule: its on/off switch, when, then, and edit and delete.
import type { EventRule, NotionSchema } from '@union/core';
import {
  BOARD_LABELS,
  TRIGGER_LABELS,
  VERDICT_LABELS,
  type EventTrigger,
} from '@union/core/event-rules';
import type { ReactElement } from 'react';

import { stepTitle } from '../../lib/labels';
import { Switch } from '../choice';
import { ConfirmButton } from '../confirm-button';
import { IconButton, PencilIcon, TrashIcon } from '../icon-button';
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

/** One rule: its on/off switch, when, then, and edit and delete. */
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
    <li
      className={`flex items-start gap-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-800 ${rule.enabled ? '' : 'opacity-60'}`}
    >
      <Switch checked={rule.enabled} onChange={onToggle}>
        <span className="sr-only">{rule.enabled ? 'On' : 'Off'}</span>
      </Switch>
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p className="font-medium">{rule.name}</p>
        <p className="text-zinc-600 dark:text-zinc-400">
          <span className="text-xs font-medium text-zinc-500 uppercase">When</span>{' '}
          {triggerText(rule.trigger)}
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          <span className="text-xs font-medium text-zinc-500 uppercase">Then</span>{' '}
          <ActionText projectId={projectId} notion={notion} action={rule.action} />
        </p>
      </div>
      <IconButton label="Edit rule" onClick={onEdit}>
        <PencilIcon />
      </IconButton>
      <ConfirmButton
        label="Delete rule"
        icon={<TrashIcon />}
        question="Delete this rule?"
        confirmLabel="Delete"
        onConfirm={onDelete}
      />
    </li>
  );
}
