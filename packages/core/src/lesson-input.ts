// The lessons a Memory page save sends, checked (a known step or the spec report, a one-line rule, the id
// of a kept lesson), and the lesson writer's proposals applied to them (browser-safe).
import { FULL_FLOW, isCustomStep, type PipelineStep } from './states';

/** The spec report's lessons: it is no pipeline step, but learns from the reviewer as the steps do. */
export const REPORT_LESSONS = 'review_report';

/** Where a lesson applies: a step of the pipeline, or the spec report. */
export type LessonSection = PipelineStep | typeof REPORT_LESSONS;

/** A lesson as saved; `id` names a kept lesson, which keeps its id, and is left out for a new one. */
export type LessonInput = { id?: number; section: LessonSection; rule: string };

/**
 * A lesson the lesson writer or the tidier proposes: added, or put in place of the kept lessons
 * `replaces` names (a merge, a move to another step, a rewording); an empty rule removes them. `why`
 * says what is wrong with the lessons replaced. Runs from before `replaces` have neither.
 */
export type LessonProposal = {
  section: LessonSection;
  rule: string;
  replaces?: number[];
  why?: string;
};

/** What a save holds: every lesson, and the feedback the new ones were made from. */
export type LessonsSave = { lessons: LessonInput[]; curated: number[] };

export const MAX_LESSON_LENGTH = 500;
const MAX_LESSONS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A step of the pipeline, a custom step, or the spec report. */
export function isLessonSection(value: unknown): value is LessonSection {
  return (
    value === REPORT_LESSONS || isCustomStep(value) || FULL_FLOW.some((step) => step === value)
  );
}

/** A rule as lessons keep it: on one line, trimmed. */
export function lessonRule(value: unknown): string {
  return typeof value === 'string' ? value.replaceAll(/\s+/gu, ' ').trim() : '';
}

/** One lesson, or why it is refused; its rule is trimmed and kept on one line. */
function parseLesson(value: unknown, index: number): LessonInput | string {
  if (!isRecord(value) || !isLessonSection(value.section)) {
    return `Lesson ${index + 1} needs a step`;
  }
  const rule = lessonRule(value.rule);
  if (rule === '') {
    return `Lesson ${index + 1} is empty`;
  }
  if (rule.length > MAX_LESSON_LENGTH) {
    return `Lesson ${index + 1} is longer than ${MAX_LESSON_LENGTH} characters`;
  }
  if (value.id === undefined) {
    return { section: value.section, rule };
  }
  if (!isId(value.id)) {
    return `Lesson ${index + 1} has a bad id`;
  }
  return { id: value.id, section: value.section, rule };
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Whether two lessons of the save name the same kept lesson. */
function sharesAnId(lessons: readonly LessonInput[]): boolean {
  const ids = lessons.flatMap((lesson) => lesson.id ?? []);
  return new Set(ids).size !== ids.length;
}

function parseIds(value: unknown): number[] | string {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((id) => isId(id))) {
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
  if (sharesAnId(lessons)) {
    return 'Two lessons have the same id';
  }
  const curated = parseIds(body.curated);
  return typeof curated === 'string' ? curated : { lessons, curated };
}

/**
 * `lessons` with `proposal` accepted: it takes the place of the first lesson it replaces (keeping
 * that lesson's id), the others it replaces go, and it is added at the end when none is left. An
 * empty rule only removes the lessons it replaces.
 */
export function withProposal(
  lessons: readonly LessonInput[],
  proposal: LessonProposal,
): LessonInput[] {
  const replaces = new Set(proposal.replaces);
  const lesson = { section: proposal.section, rule: proposal.rule };
  const at = lessons.findIndex((kept) => kept.id !== undefined && replaces.has(kept.id));
  if (proposal.rule === '') {
    return lessons.filter((kept) => kept.id === undefined || !replaces.has(kept.id));
  }
  if (at === -1) {
    return [...lessons, lesson];
  }
  return lessons.flatMap((kept, index) => {
    const { id } = kept;
    if (id === undefined || !replaces.has(id)) {
      return [kept];
    }
    return index === at ? [{ id, ...lesson }] : [];
  });
}
