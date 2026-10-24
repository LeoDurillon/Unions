// One lesson as a card: its whole rule, wrapped; the pencil opens a multiline field to edit it.
import { MAX_LESSON_LENGTH } from '@union/core/lesson-input';
import { useEffect, useRef, type ReactElement } from 'react';

import { CheckIcon, IconButton, PencilIcon } from '../icon-button';
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
        <IconButton label="Remove lesson" danger onClick={props.onRemove}>
          ✕
        </IconButton>
      </div>
    </li>
  );
}
