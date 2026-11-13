// Editing one property of a tracker's item: the input its tracker and type take, from its current value, Save or Cancel.

import type { TrackerProperty } from '@union/core';
import { useState, type ReactElement } from 'react';

import { draftOf, type TrackerDraft } from '../../lib/integrations/tracker-draft';
import { JiraPropertyInput } from '../jira/jira-property-input';
import { NotionPropertyInput } from '../notion/notion-property-input';
import { Button, ErrorText } from '../ui/ui';

/** Which tracker the item is in, the project whose lists the inputs read, where a Jira issue's moves are read. */
export type TrackerEditContext = {
  kind: 'notion' | 'jira';
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
  const input = { property, draft, onChange: setDraft };
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      {context.kind === 'jira' ? (
        <JiraPropertyInput
          transitionsUrl={context.transitionsUrl}
          projectId={context.projectId}
          {...input}
        />
      ) : (
        <NotionPropertyInput projectId={context.projectId} {...input} />
      )}
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
