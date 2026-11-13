// Editing one property of a tracker's item: the input its type takes, from its current value, then Save or Cancel.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import { notionValueText } from '../../lib/integrations/tracker-value-text';
import { useNotionUsers } from '../../lib/integrations/use-notion-users';
import { ValueField } from '../settings/value-field';
import { Button, ErrorText } from '../ui/ui';

export function TrackerPropertyEditor({
  projectId,
  property,
  onSave,
  onCancel,
}: {
  projectId: number;
  property: TrackerProperty;
  /** Queues the value (as a rule's is written) and its text; rejects with the reason it was refused. */
  onSave: (value: string, text: string) => Promise<void>;
  onCancel: () => void;
}): ReactElement {
  const [value, setValue] = useState(property.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const members = useNotionUsers(projectId, property.type === 'people').data ?? [];
  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim(), notionValueText(property.type, value, members));
    } catch (error_) {
      setError(error_ instanceof Error ? error_ : new Error(String(error_)));
      setSaving(false);
    }
  };
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <ValueField
        projectId={projectId}
        property={{
          id: property.id,
          name: property.name,
          type: property.type,
          options: property.options,
        }}
        value={value}
        variables={false}
        onChange={setValue}
      />
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          onClick={() => {
            void save();
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
