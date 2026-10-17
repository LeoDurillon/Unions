// Project settings → Memory: the lessons each agent step gets, and the feedback they are made from.
import type { FeedbackItem, Lesson } from '@union/core';
import { MAX_LESSON_LENGTH, type LessonsSave } from '@union/core/lesson-input';
import { FULL_FLOW, type PipelineStep } from '@union/core/states';
import type { ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import { useCurateFeedback, useFeedback, useLessons, useSaveLessons } from '../../lib/use-memory';
import { useSettingsForm, type SettingsForm } from '../../lib/use-settings-form';
import { FeedbackInbox, type FeedbackActions } from './feedback-inbox';
import { LessonList } from './lesson-list';
import { SaveBar } from './save-bar';

function stepOf(section: string): PipelineStep {
  return FULL_FLOW.find((step) => step === section) ?? 'implement';
}

/** A lesson's first draft: the feedback's first line, on the step it was given on. */
function draftFrom(item: FeedbackItem): LessonsSave['lessons'][number] {
  const firstLine = item.text.trim().split('\n')[0] ?? '';
  return { section: stepOf(item.section), rule: firstLine.slice(0, MAX_LESSON_LENGTH) };
}

/** Make a lesson adds to the form (curated on Save); Dismiss and Back to new apply at once. */
function useFeedbackActions(
  projectId: number,
  form: SettingsForm<LessonsSave>,
  fresh: ReadonlySet<number>,
): FeedbackActions {
  const curate = useCurateFeedback(projectId);
  return {
    pending: form.value.curated.filter((id) => fresh.has(id)),
    makeLesson: (item) => {
      form.set({
        lessons: [...form.value.lessons, draftFrom(item)],
        curated: [...form.value.curated, item.id],
      });
    },
    setCurated: (id, curated) => {
      curate.mutate({ id, curated });
    },
    busy: curate.isPending,
    error: curate.error,
  };
}

function MemoryForm({
  project,
  lessons,
  feedback,
}: {
  project: PublicProject;
  lessons: readonly Lesson[];
  feedback: readonly FeedbackItem[];
}): ReactElement {
  const fresh = new Set(feedback.filter((item) => item.curatedAt === null).map((item) => item.id));
  const write = useSaveLessons(project.id);
  const form = useSettingsForm<LessonsSave>(
    () => ({
      lessons: lessons.map(({ section, rule }) => ({ section: stepOf(section), rule })),
      curated: [],
    }),
    (save) => write({ ...save, curated: save.curated.filter((id) => fresh.has(id)) }),
  );
  const actions = useFeedbackActions(project.id, form, fresh);
  const empty = form.value.lessons.some((lesson) => lesson.rule.trim() === '');
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Lessons</h3>
        <p className="text-xs text-zinc-500">
          Rules learned from your feedback, sent to every run of their step on this project, after
          the project instructions. Applies from the next agent run.
        </p>
        <LessonList
          lessons={form.value.lessons}
          onChange={(next) => {
            form.set({ ...form.value, lessons: next });
          }}
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Feedback</h3>
        <p className="text-xs text-zinc-500">
          What you wrote on Revise and final reviews. Make a lesson from what should hold for every
          ticket, dismiss the rest.
        </p>
        <FeedbackInbox feedback={feedback} actions={actions} />
      </div>
      <SaveBar state={form} invalid={empty ? 'Write each lesson or remove it.' : null} />
    </section>
  );
}

/** Loads the lessons and feedback, then shows the page's form over them. */
export function MemorySection({ project }: { project: PublicProject }): ReactElement {
  const lessons = useLessons(project.id);
  const feedback = useFeedback(project.id);
  if (lessons.error ?? feedback.error) {
    return <p className="text-sm text-red-600">Could not load the project&apos;s memory.</p>;
  }
  if (!lessons.data || !feedback.data) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  return <MemoryForm project={project} lessons={lessons.data} feedback={feedback.data} />;
}
