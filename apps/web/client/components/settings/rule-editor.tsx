import type { NotionSchema } from '@union/core';
import { useState, type ReactElement } from 'react';

import type { RuleDraft } from '../../lib/event-rules-api';
import { useLeaveGuard } from '../../lib/leave-guard';
import { Button, ErrorText, Field, inputClass } from '../ui';
import { ActionFields } from './action-fields';
import { RulePreviewBox } from './rule-preview';
import { TriggerFields } from './trigger-fields';

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
