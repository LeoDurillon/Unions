import { useState, type ReactElement } from 'react';

import type { Selection } from '../../lib/diff-selection';
import { Button, ErrorText, inputClass } from '../ui';

/** Shown under the selected lines; Shift-click another line number to extend the block. */
export function CommentEditor({
  selection,
  pending,
  error,
  onSave,
  onCancel,
}: {
  selection: Selection;
  pending: boolean;
  error: Error | null;
  onSave: (body: string) => void;
  onCancel: () => void;
}): ReactElement {
  const [body, setBody] = useState('');
  const range =
    selection.start === selection.end
      ? `line ${selection.start}`
      : `lines ${selection.start}-${selection.end}`;
  return (
    <div className="space-y-2 rounded-md border border-indigo-300 bg-indigo-50 p-2 dark:border-indigo-900 dark:bg-indigo-950/40">
      <p className="text-xs text-zinc-500">
        Comment on {range}. Shift-click another line number to extend the block.
      </p>
      <textarea
        className={`${inputClass} min-h-20`}
        aria-label="New comment"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
        }}
      />
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={body.trim() === '' || pending}
          onClick={() => {
            onSave(body);
          }}
        >
          Add comment
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
