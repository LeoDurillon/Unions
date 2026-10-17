// One lesson as a card: its whole rule, wrapped; the pencil opens a multiline field to edit it.
import { MAX_LESSON_LENGTH } from '@union/core/lesson-input';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';

import { inputClass } from '../ui';

export type LessonCardProps = {
  place: number;
  rule: string;
  editing: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  /** Closes the field; an empty rule is removed then. */
  onDone: () => void;
  onRule: (rule: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

const ICON_BUTTON =
  'flex size-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';

function IconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={ICON_BUTTON}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PencilIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M13.6 2.6a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8l-9.3 9.3a1 1 0 0 1-.46.26l-4 1a.75.75 0 0 1-.91-.91l1-4a1 1 0 0 1 .26-.46l9.6-9Zm1.4 1.4L5.9 13.1l-.5 2 2-.5L16.6 5.4l-1.6-1.4Z" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

/** The rule in a field that grows with it; Enter or Escape closes it (a rule is one paragraph). */
function RuleField({ props }: { props: LessonCardProps }): ReactElement {
  const field = useRef<HTMLTextAreaElement>(null);
  // Opened by the pencil or by Make a lesson: shown, and typing goes to it after the text already there.
  useEffect(() => {
    const element = field.current;
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element?.focus({ preventScroll: true });
    element?.setSelectionRange(element.value.length, element.value.length);
  }, []);
  return (
    <textarea
      ref={field}
      aria-label={`Lesson ${props.place + 1}`}
      rows={2}
      className={`${inputClass} field-sizing-content min-h-16 resize-none text-sm`}
      maxLength={MAX_LESSON_LENGTH}
      value={props.rule}
      placeholder="One rule, as you would tell the agent"
      onChange={(event) => {
        props.onRule(event.target.value);
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
          event.preventDefault();
          props.onDone();
        }
      }}
    />
  );
}

export function LessonCard(props: LessonCardProps): ReactElement {
  return (
    <li className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0 flex-1">
        {props.editing ? (
          <RuleField props={props} />
        ) : (
          <p className="py-1 text-sm break-words whitespace-pre-wrap">{props.rule}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {props.editing ? (
          <IconButton label="Done" onClick={props.onDone}>
            <CheckIcon />
          </IconButton>
        ) : (
          <IconButton label="Edit lesson" onClick={props.onEdit}>
            <PencilIcon />
          </IconButton>
        )}
        <IconButton
          label="Move up"
          disabled={props.first}
          onClick={() => {
            props.onMove(-1);
          }}
        >
          ↑
        </IconButton>
        <IconButton
          label="Move down"
          disabled={props.last}
          onClick={() => {
            props.onMove(1);
          }}
        >
          ↓
        </IconButton>
        <IconButton label="Remove lesson" onClick={props.onRemove}>
          ✕
        </IconButton>
      </div>
    </li>
  );
}
