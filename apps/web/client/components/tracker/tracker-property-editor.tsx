// Editing one property of a tracker's item: the input its shared type takes, from its current value, Save or Cancel.

import type { TrackerProperty } from '@union/core';
import type { IntegrationKindName } from '@union/core/integration-kinds';
import { useState, type ReactElement } from 'react';

import { draftOf, type TrackerDraft } from '../../lib/integrations/tracker-draft';
import { Button, ErrorText } from '../ui/ui';
import { TrackerValueInput } from './tracker-value-input';

/** Which tracker the item is in, the project whose lists the inputs read, where a Jira issue's moves are read. */
export type TrackerEditContext = {
  kind: IntegrationKindName;
  projectId: number;
  transitionsUrl: string | null;
};

export function TrackerPropertyEditor({
  context,
  property,
  onSave,
  onCancel,
}: {
  context: TrackerEditContext;
  property: TrackerProperty;
  /** Queues the new value; rejects with the reason it was refused. */
  onSave: (draft: TrackerDraft) => Promise<void>;
  onCancel: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(() => draftOf(property));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, value: draft.value.trim() });
    } catch (error_) {
      setError(error_ instanceof Error ? error_ : new Error(String(error_)));
      setSaving(false);
    }
  };
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <TrackerValueInput
        projectId={context.projectId}
        tracker={context.kind}
        field={property}
        draft={draft}
        variables={false}
        movesUrl={context.transitionsUrl}
        onChange={setDraft}
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
