import type { NotionSchema } from '@union/core';
import {
  BOARD_LABELS,
  TRIGGER_KINDS,
  TRIGGER_LABELS,
  type EventTrigger,
} from '@union/core/event-rules';
import { BOARD_STATUSES, PLANNING_STEPS } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { RuleDraft } from '../../lib/event-rules-api';
import { STEP_TITLES } from '../../lib/labels';
import { useLeaveGuard } from '../../lib/leave-guard';
import { Button, ErrorText, Field, inputClass } from '../ui';
import { ActionFields } from './action-fields';
import { RulePreviewBox } from './rule-preview';

const APPROVAL_STEPS = [...PLANNING_STEPS, 'implement', 'final_review'] as const;

function triggerOf(kind: EventTrigger['kind']): EventTrigger {
  if (kind === 'board_status') {
    return { kind, status: 'done' };
  }
  if (kind === 'awaiting_approval') {
    return { kind, step: null };
  }
  return { kind };
}

/** The column or step some triggers need. */
function TriggerDetail({
  trigger,
  onChange,
}: {
  trigger: EventTrigger;
  onChange: (trigger: EventTrigger) => void;
}): ReactElement | null {
  return (
    <>
      {trigger.kind === 'board_status' ? (
        <select
          aria-label="Board column"
          className={inputClass}
          value={trigger.status}
          onChange={(event) => {
            const status = BOARD_STATUSES.find((candidate) => candidate === event.target.value);
            if (status) {
              onChange({ kind: 'board_status', status });
            }
          }}
        >
          {BOARD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {BOARD_LABELS[status]}
            </option>
          ))}
        </select>
      ) : null}
      {trigger.kind === 'awaiting_approval' ? (
        <select
          aria-label="Step"
          className={inputClass}
          value={trigger.step ?? ''}
          onChange={(event) => {
            const step = APPROVAL_STEPS.find((candidate) => candidate === event.target.value);
            onChange({ kind: 'awaiting_approval', step: step ?? null });
          }}
        >
          <option value="">Any step</option>
          {APPROVAL_STEPS.map((step) => (
            <option key={step} value={step}>
              {STEP_TITLES[step]}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}

function TriggerFields({
  trigger,
  onChange,
}: {
  trigger: EventTrigger;
  onChange: (trigger: EventTrigger) => void;
}): ReactElement {
  return (
    <Field label="When">
      <select
        className={inputClass}
        value={trigger.kind}
        onChange={(event) => {
          const kind = TRIGGER_KINDS.find((candidate) => candidate === event.target.value);
          if (kind) {
            onChange(triggerOf(kind));
          }
        }}
      >
        {TRIGGER_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {TRIGGER_LABELS[kind]}
          </option>
        ))}
      </select>
      <TriggerDetail trigger={trigger} onChange={onChange} />
    </Field>
  );
}

function NameField({
  name,
  onChange,
}: {
  name: string;
  onChange: (name: string) => void;
}): ReactElement {
  return (
    <Field label="Name">
      <input
        className={inputClass}
        value={name}
        placeholder="PR link in Notion"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

/** Edits a rule: its name, what triggers it, and what it does. */
export function RuleEditor({
  projectId,
  notion,
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  projectId: number;
  notion: NotionSchema | null;
  initial: RuleDraft;
  saving: boolean;
  error: Error | null;
  onSave: (rule: RuleDraft) => void;
  onCancel: () => void;
}): ReactElement {
  const [rule, setRule] = useState(initial);
  useLeaveGuard(JSON.stringify(rule) !== JSON.stringify(initial));
  return (
    <div className="space-y-3 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
      <NameField
        name={rule.name}
        onChange={(name) => {
          setRule({ ...rule, name });
        }}
      />
      <TriggerFields
        trigger={rule.trigger}
        onChange={(trigger) => {
          setRule({ ...rule, trigger });
        }}
      />
      <ActionFields
        projectId={projectId}
        notion={notion}
        action={rule.action}
        onChange={(action) => {
          setRule({ ...rule, action });
        }}
      />
      <RulePreviewBox projectId={projectId} rule={rule} />
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={saving}
          onClick={() => {
            onSave(rule);
          }}
        >
          {saving ? 'Saving…' : 'Save rule'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
