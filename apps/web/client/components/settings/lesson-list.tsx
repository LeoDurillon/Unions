// The project's lessons by agent step, as cards: edited one at a time, reordered and removed in the page's form.
import type { LessonInput } from '@union/core/lesson-input';
import { FULL_FLOW, type PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import { STEP_TITLES } from '../../lib/labels';
import { Button } from '../ui';
import { LessonCard, type LessonCardProps } from './lesson-card';

type Change = (lessons: LessonInput[]) => void;

/** Which lesson shows its field, by its place in the whole list; null: none. */
type Editing = { at: number | null; open: (at: number | null) => void };

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

function without(lessons: readonly LessonInput[], at: number): LessonInput[] {
  return lessons.filter((_lesson, index) => index !== at);
}

type CardActions = Pick<LessonCardProps, 'onEdit' | 'onDone' | 'onRule' | 'onMove' | 'onRemove'>;

/** What lesson `at`'s card does to the list and to which card is edited. */
function cardActions(
  lessons: readonly LessonInput[],
  at: number,
  onChange: Change,
  editing: Editing,
): CardActions {
  const close = (next: LessonInput[]): void => {
    onChange(next);
    editing.open(null);
  };
  return {
    onEdit: () => {
      editing.open(at);
    },
    onDone: () => {
      if (lessons[at]?.rule.trim() === '') {
        onChange(without(lessons, at));
      }
      editing.open(null);
    },
    onRule: (rule) => {
      onChange(lessons.map((lesson, index) => (index === at ? { ...lesson, rule } : lesson)));
    },
    onMove: (direction) => {
      close(moved(lessons, at, direction));
    },
    onRemove: () => {
      close(without(lessons, at));
    },
  };
}

function StepLessons({
  step,
  lessons,
  onChange,
  editing,
}: {
  step: PipelineStep;
  lessons: readonly LessonInput[];
  onChange: Change;
  editing: Editing;
}): ReactElement {
  const indexes = lessons.flatMap((lesson, index) => (lesson.section === step ? [index] : []));
  const card = (at: number, place: number): ReactElement => (
    <LessonCard
      key={at}
      place={place}
      rule={lessons[at]?.rule ?? ''}
      editing={editing.at === at}
      first={place === 0}
      last={place === indexes.length - 1}
      {...cardActions(lessons, at, onChange, editing)}
    />
  );
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{STEP_TITLES[step]}</h4>
        <Button
          className="px-2 py-1 text-xs"
          onClick={() => {
            onChange([...lessons, { section: step, rule: '' }]);
            editing.open(lessons.length);
          }}
        >
          Add a lesson
        </Button>
      </div>
      {indexes.length === 0 ? (
        <p className="text-xs text-zinc-500">No lessons.</p>
      ) : (
        <ul className="space-y-1.5">{indexes.map((at, place) => card(at, place))}</ul>
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
  const [editingAt, setEditingAt] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {FULL_FLOW.map((step) => (
        <StepLessons
          key={step}
          step={step}
          lessons={lessons}
          onChange={onChange}
          editing={{ at: editingAt, open: setEditingAt }}
        />
      ))}
    </div>
  );
}
