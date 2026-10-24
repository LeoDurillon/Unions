// One spec in the specs dialog: its label and source, its text to read or edit, Use the source once
// edited, Remove.
import { useState, type ReactElement } from 'react';

import type { ReviewSpecView } from '../../../src/review-spec-types';
import { ConfirmButton } from '../confirm-button';
import { TrashIcon } from '../icon-button';
import { Badge, Button, inputClass } from '../ui';
import { LABELS } from './spec-picker';

/** Characters of a closed card's text shown as its preview. */
const PREVIEW_CHARS = 240;

/** A spec in the dialog, with a key of its own while it is edited. */
export type SpecItem = ReviewSpecView & { key: string };

function Preview({ item }: { item: SpecItem }): ReactElement {
  if (item.error) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">Could not read it: {item.error}</p>
    );
  }
  const text = item.text ?? item.current ?? '';
  return (
    <p className="line-clamp-3 text-xs whitespace-pre-wrap text-zinc-500">
      {text === '' ? 'Read from its source when saved.' : text.slice(0, PREVIEW_CHARS)}
    </p>
  );
}

/** The row's buttons: Use the source once edited, Edit or Done, Remove. */
function SpecActions({
  item,
  editing,
  onEditing,
  onChange,
}: {
  item: SpecItem;
  editing: boolean;
  onEditing: (editing: boolean) => void;
  onChange: (next: Partial<SpecItem>) => void;
}): ReactElement {
  const edited = item.text !== null;
  return (
    <>
      {edited ? (
        <Button
          variant="ghost"
          title="Forget your text: read it from its source again"
          onClick={() => {
            onChange({ text: null });
            onEditing(false);
          }}
        >
          Use the source
        </Button>
      ) : null}
      <Button
        disabled={item.error !== null && !edited}
        onClick={() => {
          onEditing(!editing);
        }}
      >
        {editing ? 'Done' : 'Edit'}
      </Button>
      <ConfirmButton
        label={`Remove ${item.label}`}
        icon={<TrashIcon />}
        question="Remove this spec?"
        confirmLabel="Remove"
        onConfirm={() => {
          onChange({ removed: true });
        }}
      />
    </>
  );
}

export function SpecRow({
  item,
  onChange,
}: {
  item: SpecItem;
  onChange: (next: Partial<SpecItem>) => void;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  return (
    <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.label}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
              {item.label}
            </a>
          ) : (
            item.label
          )}
        </span>
        {item.text === null ? null : <Badge tone="amber">edited</Badge>}
        <span className="text-xs text-zinc-500">{LABELS[item.kind]}</span>
        <SpecActions item={item} editing={editing} onEditing={setEditing} onChange={onChange} />
      </div>
      {editing ? (
        <textarea
          aria-label={`Text of ${item.label}`}
          className={`${inputClass} h-56 font-mono text-xs`}
          value={item.text ?? item.current ?? ''}
          onChange={(event) => {
            onChange({ text: event.target.value });
          }}
        />
      ) : (
        <Preview item={item} />
      )}
    </li>
  );
}
