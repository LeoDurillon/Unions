// The Memory page's lessons part: whether they are sent to the agents, then the lessons by step.
import type { LessonInput } from '@union/core/lesson-input';
import type { ReactElement } from 'react';

import { Switch } from '../choice';
import { LessonList } from './lesson-list';

type Value = { enabled: boolean; lessons: LessonInput[] };

/** Turned off, the lessons stay here, editable, but no agent gets them. */
export function LessonsPanel({
  value,
  onChange,
}: {
  value: Value;
  onChange: (value: Partial<Value>) => void;
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
      <div className={value.enabled ? '' : 'opacity-60'}>
        <LessonList
          lessons={value.lessons}
          onChange={(lessons) => {
            onChange({ lessons });
          }}
        />
      </div>
    </div>
  );
}
