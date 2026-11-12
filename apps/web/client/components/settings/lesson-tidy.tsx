// "Tidy lessons" on the Memory page: asks the lesson tidier to fix the lessons kept, then shows its proposals.

import type { LessonInput } from '@union/core/lesson-input';
import type { ReactElement } from 'react';

import { useLessonSuggestion, useLessonWriter } from '../../lib/settings/use-memory';
import { Button, ErrorText } from '../ui/ui';
import { LessonSuggestions, type AcceptLessons } from './lesson-suggestions';

const TIDY_HINT =
  'The lesson tidier (Sonnet unless changed in Union settings) reads the saved lessons and proposes merges, moves to the right step, rewordings and removals you accept or drop. It uses your Claude usage.';

/** The button (one run at a time with the lesson writer), then the tidier's latest run. */
export function TidyLessons({
  projectId,
  lessons,
  onAccept,
}: {
  projectId: number;
  lessons: readonly LessonInput[];
  onAccept: AcceptLessons;
}): ReactElement {
  const { tidy } = useLessonWriter(projectId);
  const status = useLessonSuggestion(projectId).data?.status;
  const working = tidy.isPending || status === 'queued' || status === 'running';
  const saved = lessons.some((lesson) => lesson.id !== undefined);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="px-2 py-1 text-xs"
          disabled={working || !saved}
          title={TIDY_HINT}
          onClick={() => {
            tidy.mutate();
          }}
        >
          Tidy lessons
        </Button>
        <span className="text-xs text-zinc-500">
          Finds lessons that repeat each other, sit on the wrong step or contradict each other.
        </span>
      </div>
      <ErrorText error={tidy.error} />
      <LessonSuggestions projectId={projectId} kind="tidy" lessons={lessons} onAccept={onAccept} />
    </div>
  );
}
