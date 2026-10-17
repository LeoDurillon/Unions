// Project settings → Memory: the lessons each agent step gets, and the feedback they are made from.
import type { FeedbackItem, Lesson } from '@union/core';
import { MAX_LESSON_LENGTH, type LessonInput } from '@union/core/lesson-input';
import { FULL_FLOW, type PipelineStep } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { PublicProject } from '../../../src/api-types';
import {
  useCurateFeedback,
  useLessonSuggestion,
  useLessonWriter,
  useFeedback,
  useLessons,
  useSaveMemory,
  type MemorySave,
} from '../../lib/use-memory';
import { useSettingsForm, type SettingsForm } from '../../lib/use-settings-form';
import { FeedbackInbox, type FeedbackActions } from './feedback-inbox';
import { LessonsPanel } from './lessons-panel';
import { SaveBar } from './save-bar';

function stepOf(section: string): PipelineStep {
  return FULL_FLOW.find((step) => step === section) ?? 'implement';
}

/** A lesson's first draft: the feedback's first line, on the step it was given on. */
function draftFrom(item: FeedbackItem): LessonInput {
  const firstLine = item.text.trim().split('\n')[0] ?? '';
  return { section: stepOf(item.section), rule: firstLine.slice(0, MAX_LESSON_LENGTH) };
}

/**
 * Make a lesson and the writer's accepted proposals add to the form (their feedback curated on
 * Save); Dismiss, Back to new and asking the writer apply at once.
 */
function useFeedbackActions(
  projectId: number,
  form: SettingsForm<MemorySave>,
  fresh: ReadonlySet<number>,
  openLesson: (at: number) => void,
): FeedbackActions {
  const curate = useCurateFeedback(projectId);
  const { suggest } = useLessonWriter(projectId);
  const run = useLessonSuggestion(projectId).data;
  const add = (lessons: LessonInput[], feedbackIds: readonly number[]): void => {
    const curated = form.value.curated.filter((id) => !feedbackIds.includes(id));
    form.set({
      ...form.value,
      lessons: [...form.value.lessons, ...lessons],
      curated: [...curated, ...feedbackIds],
    });
  };
  return {
    projectId,
    pending: form.value.curated.filter((id) => fresh.has(id)),
    makeLesson: (item) => {
      add([draftFrom(item)], [item.id]);
      openLesson(form.value.lessons.length);
    },
    onAccept: add,
    setCurated: (id, curated) => {
      curate.mutate({ id, curated });
    },
    suggest: (ids) => {
      suggest.mutate(ids);
    },
    writing: suggest.isPending || run?.status === 'queued' || run?.status === 'running',
    busy: curate.isPending,
    error: curate.error ?? suggest.error,
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
  const write = useSaveMemory(project);
  const form = useSettingsForm<MemorySave>(
    () => ({
      enabled: project.config.memory !== false,
      lessons: lessons.map(({ section, rule }) => ({ section: stepOf(section), rule })),
      curated: [],
    }),
    (save) => write({ ...save, curated: save.curated.filter((id) => fresh.has(id)) }),
  );
  const [editingAt, setEditingAt] = useState<number | null>(null);
  const actions = useFeedbackActions(project.id, form, fresh, setEditingAt);
  const empty = form.value.lessons.some((lesson) => lesson.rule.trim() === '');
  return (
    <section className="space-y-6">
      <LessonsPanel
        value={form.value}
        onChange={(value) => {
          form.set({ ...form.value, ...value });
        }}
        editing={{ at: editingAt, open: setEditingAt }}
      />
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
