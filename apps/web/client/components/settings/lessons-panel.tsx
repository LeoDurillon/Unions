// The Memory page's lessons part: whether they are sent to the agents, Tidy lessons, then the lessons by step.
// Also the page's shape while the lessons are read.

import type { LessonInput } from '@union/core/lesson-input';
import type { ReactElement } from 'react';

import { Switch } from '../ui/choice';
import { Loading, SkeletonLines } from '../ui/skeleton';
import { LessonList, type Editing } from './lesson-list';
import type { AcceptLessons } from './lesson-suggestions';
import { TidyLessons } from './lesson-tidy';

type Value = { enabled: boolean; lessons: LessonInput[] };

/** Turned off, the lessons stay here, editable, but no agent gets them. */
export function LessonsPanel({
  projectId,
  value,
  onChange,
  onAccept,
  editing,
}: {
  projectId: number;
  value: Value;
  onChange: (value: Partial<Value>) => void;
  /** Applies the tidier's accepted proposals to the form. */
  onAccept: AcceptLessons;
  editing: Editing;
}): ReactElement {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Lessons</h3>
      <p className="text-xs text-zinc-500">
        Rules learned from your feedback, sent to every run of their step on this project, after the
        project instructions. Applies from the next agent run.
      </p>
      <Switch
        checked={value.enabled}
        onChange={(enabled) => {
          onChange({ enabled });
        }}
        hint={
          value.enabled
            ? 'Each step gets its lessons.'
            : 'Off: no agent gets the lessons. They are kept, and feedback is still recorded.'
        }
      >
        Send lessons to the agents
      </Switch>
      <TidyLessons projectId={projectId} lessons={value.lessons} onAccept={onAccept} />
      <div className={value.enabled ? '' : 'opacity-60'}>
        <LessonList
          lessons={value.lessons}
          onChange={(lessons) => {
            onChange({ lessons });
          }}
          editing={editing}
        />
      </div>
    </div>
  );
}

/** The Memory page while its lessons and feedback are read. */
export function LessonsLoading(): ReactElement {
  return (
    <section>
      <Loading label="Reading the memory" className="space-y-3">
        <SkeletonLines count={4} title />
      </Loading>
    </section>
  );
}
