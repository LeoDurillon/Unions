// A comment box's textarea where typing `@` and a name lists the tracker's people to tag. A pick writes their
// mention token (`[@Name](mention:<id>)`), which the tracker turns into its mention.

import { useRef, type ReactElement } from 'react';

import { useMentionPicker, type MentionPicker } from '../../lib/integrations/use-mention-picker';
import type { MentionTarget } from '../../lib/integrations/use-tracker-people';

const ROW = 'block w-full px-2 py-1 text-left';
const HIGHLIGHTED = 'bg-zinc-100 dark:bg-zinc-800';

function PeopleList({ picker }: { picker: MentionPicker }): ReactElement | null {
  if (picker.error) {
    return <p className="text-xs text-red-600 dark:text-red-400">{picker.error.message}</p>;
  }
  if (picker.people.length === 0) {
    return null;
  }
  return (
    <div
      aria-label="People to tag"
      className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      {picker.people.map((person, index) => (
        <button
          key={person.id}
          type="button"
          aria-current={index === picker.highlighted}
          className={`${ROW} ${index === picker.highlighted ? HIGHLIGHTED : ''}`}
          onMouseDown={(event) => {
            // Keeps the focus (and the caret) in the textarea.
            event.preventDefault();
            picker.handlePick(person);
          }}
        >
          @{person.name}
        </button>
      ))}
    </div>
  );
}

export function MentionTextarea({
  target,
  value,
  onChange,
  className,
  rows,
}: {
  target: MentionTarget;
  value: string;
  onChange: (value: string) => void;
  className: string;
  rows: number;
}): ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  const picker = useMentionPicker(ref, target, { value, onChange });
  return (
    <div className="space-y-1">
      <textarea
        ref={ref}
        aria-label="Reply"
        className={className}
        rows={rows}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          picker.handleMove(event.target.selectionStart);
        }}
        onSelect={(event) => {
          picker.handleMove(event.currentTarget.selectionStart);
        }}
        onKeyDown={picker.handleKeyDown}
      />
      <PeopleList picker={picker} />
    </div>
  );
}
