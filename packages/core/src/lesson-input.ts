// The lessons a Memory page save sends, checked: a known step and a one-line rule each, within the limits (browser-safe).
import { FULL_FLOW, isCustomStep, type PipelineStep } from './states';

export type LessonInput = { section: PipelineStep; rule: string };

/** What a save holds: every lesson, and the feedback the new ones were made from. */
export type LessonsSave = { lessons: LessonInput[]; curated: number[] };

export const MAX_LESSON_LENGTH = 500;
const MAX_LESSONS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPipelineStep(value: unknown): value is PipelineStep {
  return isCustomStep(value) || FULL_FLOW.some((step) => step === value);
}

/** One lesson, or why it is refused; its rule is trimmed and kept on one line. */
function parseLesson(value: unknown, index: number): LessonInput | string {
  if (!isRecord(value) || !isPipelineStep(value.section)) {
    return `Lesson ${index + 1} needs a step`;
  }
  const rule = typeof value.rule === 'string' ? value.rule.replaceAll(/\s+/gu, ' ').trim() : '';
  if (rule === '') {
    return `Lesson ${index + 1} is empty`;
  }
  if (rule.length > MAX_LESSON_LENGTH) {
    return `Lesson ${index + 1} is longer than ${MAX_LESSON_LENGTH} characters`;
  }
  return { section: value.section, rule };
}

function parseIds(value: unknown): number[] | string {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((id) => Number.isInteger(id) && id > 0)) {
    return '"curated" must be a list of feedback ids';
  }
  return value.filter((id): id is number => typeof id === 'number');
}

/** The save's lessons and curated feedback ids, or why the body is refused. */
export function parseLessonsSave(body: Record<string, unknown>): LessonsSave | string {
  if (!Array.isArray(body.lessons)) {
    return '"lessons" must be a list';
  }
  if (body.lessons.length > MAX_LESSONS) {
    return `A project keeps at most ${MAX_LESSONS} lessons`;
  }
  const lessons: LessonInput[] = [];
  for (const [index, value] of body.lessons.entries()) {
    const lesson = parseLesson(value, index);
    if (typeof lesson === 'string') {
      return lesson;
    }
    lessons.push(lesson);
  }
  const curated = parseIds(body.curated);
  return typeof curated === 'string' ? curated : { lessons, curated };
}
