// The project's lessons by agent step: a one-line rule each, edited, reordered and removed in the page's form.
import { MAX_LESSON_LENGTH, type LessonInput } from '@union/core/lesson-input';
import { FULL_FLOW, type PipelineStep } from '@union/core/states';
import type { ReactElement } from 'react';

import { STEP_TITLES } from '../../lib/labels';
import { Button, inputClass } from '../ui';

type Change = (lessons: LessonInput[]) => void;

const ICON_BUTTON =
  'rounded px-1.5 text-sm text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800';

/** The list with lesson `at` swapped with the previous (-1) or next (1) lesson of its step. */
function moved(lessons: readonly LessonInput[], at: number, direction: -1 | 1): LessonInput[] {
  const section = lessons[at]?.section;
  const same = lessons.flatMap((lesson, index) => (lesson.section === section ? [index] : []));
  const other = same[same.indexOf(at) + direction];
  const current = lessons[at];
  const swapped = other === undefined ? undefined : lessons[other];
  if (other === undefined || current === undefined || swapped === undefined) {
    return [...lessons];
  }
  return lessons.map((lesson, index) => {
    if (index === at) {
      return swapped;
    }
    return index === other ? current : lesson;
  });
}

function IconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      className={ICON_BUTTON}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LessonRow({
  lessons,
  at,
  onChange,
}: {
  lessons: readonly LessonInput[];
  at: number;
  onChange: Change;
}): ReactElement {
  const lesson = lessons[at];
  const same = lessons.flatMap((other, index) =>
    other.section === lesson?.section ? [index] : [],
  );
  const place = same.indexOf(at);
  return (
    <li className="flex items-center gap-1">
      <input
        aria-label={`Lesson ${place + 1}`}
        className={`${inputClass} text-sm`}
        maxLength={MAX_LESSON_LENGTH}
        value={lesson?.rule ?? ''}
        placeholder="One rule, as you would tell the agent"
        onChange={(event) => {
          onChange(lessons.map((l, i) => (i === at ? { ...l, rule: event.target.value } : l)));
        }}
      />
      <IconButton
        label="Move up"
        disabled={place === 0}
        onClick={() => {
          onChange(moved(lessons, at, -1));
        }}
      >
        ↑
      </IconButton>
      <IconButton
        label="Move down"
        disabled={place === same.length - 1}
        onClick={() => {
          onChange(moved(lessons, at, 1));
        }}
      >
        ↓
      </IconButton>
      <IconButton
        label="Remove lesson"
        onClick={() => {
          onChange(lessons.filter((_lesson, index) => index !== at));
        }}
      >
        ✕
      </IconButton>
    </li>
  );
}

function StepLessons({
  step,
  lessons,
  onChange,
}: {
  step: PipelineStep;
  lessons: readonly LessonInput[];
  onChange: Change;
}): ReactElement {
  const indexes = lessons.flatMap((lesson, index) => (lesson.section === step ? [index] : []));
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{STEP_TITLES[step]}</h4>
        <Button
          className="px-2 py-1 text-xs"
          onClick={() => {
            onChange([...lessons, { section: step, rule: '' }]);
          }}
        >
          Add a lesson
        </Button>
      </div>
      {indexes.length === 0 ? (
        <p className="text-xs text-zinc-500">No lessons.</p>
      ) : (
        <ul className="space-y-1.5">
          {indexes.map((at) => (
            <LessonRow key={at} lessons={lessons} at={at} onChange={onChange} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Every step of the pipeline, with its lessons; a change goes to the page's form. */
export function LessonList({
  lessons,
  onChange,
}: {
  lessons: readonly LessonInput[];
  onChange: Change;
}): ReactElement {
  return (
    <div className="space-y-3">
      {FULL_FLOW.map((step) => (
        <StepLessons key={step} step={step} lessons={lessons} onChange={onChange} />
      ))}
    </div>
  );
}
