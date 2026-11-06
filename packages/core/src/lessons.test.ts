import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { saveAgent } from './agents';
import { createDb, migrateDb, type Db } from './db';
import { parseLessonsSave, withProposal } from './lesson-input';
import {
  addLesson,
  lessonsPrompt,
  listFeedback,
  listLessons,
  reportLessonsPrompt,
  saveLessons,
  setFeedbackCurated,
  stepSharedPrompt,
} from './lessons';
import * as schema from './schema';

let db: Db;
let projectId: number;
let otherId: number;

function insertProject(repo: string): number {
  return db
    .insert(schema.projects)
    .values({ owner: 'o', repo, config: { baseBranch: 'main' } })
    .returning()
    .get().id;
}

function insertFeedback(project: number, text: string, ticketId: number | null = null): number {
  return db
    .insert(schema.feedbackEvents)
    .values({ projectId: project, ticketId, section: 'implement', text })
    .returning()
    .get().id;
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = insertProject('a');
  otherId = insertProject('b');
});

test('saving replaces the lessons in the order given and curates their feedback', () => {
  const mine = insertFeedback(projectId, 'Use bun.');
  const theirs = insertFeedback(otherId, 'Not mine.');
  saveLessons(db, projectId, [{ section: 'implement', rule: 'Old.' }]);
  const saved = saveLessons(
    db,
    projectId,
    [
      { section: 'final_review', rule: 'Check the docs.' },
      { section: 'implement', rule: 'Use bun.' },
    ],
    [mine, theirs],
  );
  expect(saved.map(({ section, rule, position }) => ({ section, rule, position }))).toEqual([
    { section: 'final_review', rule: 'Check the docs.', position: 0 },
    { section: 'implement', rule: 'Use bun.', position: 1 },
  ]);
  expect(listLessons(db, otherId)).toEqual([]);
  expect(listFeedback(db, projectId)[0]?.curatedAt).toBeNumber();
  expect(listFeedback(db, otherId)[0]?.curatedAt).toBeNull();
});

test('feedback lists newest first with its ticket, and is curated or restored one at a time', () => {
  const ticketId = db
    .insert(schema.tickets)
    .values({ projectId, title: 'Fix login', issueNumber: 7 })
    .returning()
    .get().id;
  const first = insertFeedback(projectId, 'First', ticketId);
  const second = insertFeedback(projectId, 'Second');
  expect(listFeedback(db, projectId).map((item) => item.id)).toEqual([second, first]);
  expect(listFeedback(db, projectId)[1]).toMatchObject({
    ticketTitle: 'Fix login',
    issueNumber: 7,
  });
  expect(setFeedbackCurated(db, otherId, first, true)).toBe(false);
  expect(setFeedbackCurated(db, projectId, first, true)).toBe(true);
  expect(listFeedback(db, projectId)[1]?.curatedAt).toBeNumber();
  setFeedbackCurated(db, projectId, first, false);
  expect(listFeedback(db, projectId)[1]?.curatedAt).toBeNull();
});

test('a save keeps the ids of the lessons it names, adds the new ones and removes the others', () => {
  const [kept, moved, gone] = saveLessons(db, projectId, [
    { section: 'implement', rule: 'Use bun.' },
    { section: 'summary', rule: 'Ask about the environment.' },
    { section: 'implement', rule: 'Use dayjs.' },
  ]);
  const [theirs] = saveLessons(db, otherId, [{ section: 'implement', rule: 'Not mine.' }]);
  if (!kept || !moved || !gone || !theirs) {
    throw new Error('Lessons not saved');
  }
  const saved = saveLessons(db, projectId, [
    { id: moved.id, section: 'intake', rule: 'Ask about the environment.' },
    { id: kept.id, section: 'implement', rule: 'Use bun.' },
    { id: theirs.id, section: 'implement', rule: 'Taken from another project.' },
    { section: 'test_plan', rule: 'No e2e.' },
  ]);
  expect(saved.map(({ section, rule, position }) => ({ section, rule, position }))).toEqual([
    { section: 'intake', rule: 'Ask about the environment.', position: 0 },
    { section: 'implement', rule: 'Use bun.', position: 1 },
    { section: 'implement', rule: 'Taken from another project.', position: 2 },
    { section: 'test_plan', rule: 'No e2e.', position: 3 },
  ]);
  expect(saved[0]?.id).toBe(moved.id);
  expect(saved[1]).toEqual({ ...kept, position: 1 });
  expect(saved.map((lesson) => lesson.id)).not.toContain(gone.id);
  expect(saved.map((lesson) => lesson.id)).not.toContain(theirs.id);
  expect(listLessons(db, otherId)).toEqual([theirs]);
});

test('a save refuses a bad id and two lessons with the same id', () => {
  const lesson = { section: 'implement', rule: 'Use bun.' } as const;
  expect(parseLessonsSave({ lessons: [{ ...lesson, id: 1 }] })).toEqual({
    lessons: [{ ...lesson, id: 1 }],
    curated: [],
  });
  expect(parseLessonsSave({ lessons: [{ ...lesson, id: 'a' }] })).toBe('Lesson 1 has a bad id');
  expect(
    parseLessonsSave({
      lessons: [
        { ...lesson, id: 2 },
        { ...lesson, id: 2 },
      ],
    }),
  ).toBe('Two lessons have the same id');
});

test('an accepted proposal takes the place of the lessons it replaces, or is added', () => {
  const lessons = [
    { id: 1, section: 'implement', rule: 'Use dayjs.' },
    { id: 2, section: 'summary', rule: 'Ask about the environment.' },
    { section: 'implement', rule: 'Unsaved.' },
    { id: 3, section: 'implement', rule: 'Format dates with dayjs.' },
  ] as const;
  expect(
    withProposal(lessons, { section: 'implement', rule: 'Dates: dayjs.', replaces: [3, 1] }),
  ).toEqual([{ id: 1, section: 'implement', rule: 'Dates: dayjs.' }, lessons[1], lessons[2]]);
  expect(withProposal(lessons, { section: 'intake', rule: 'Ask.', replaces: [9] })).toEqual([
    ...lessons,
    { section: 'intake', rule: 'Ask.' },
  ]);
  expect(withProposal(lessons, { section: 'intake', rule: 'Old run.' }).at(-1)).toEqual({
    section: 'intake',
    rule: 'Old run.',
  });
});

test("a step's prompt gets its own lessons after the project instructions, none when it has none", () => {
  saveAgent(db, 'shared', { prompt: 'Be brief.', model: null });
  saveLessons(db, projectId, [
    { section: 'implement', rule: 'Use bun.' },
    { section: 'intake', rule: 'Ask about scope.' },
    { section: 'implement', rule: 'Run the checks.' },
  ]);
  expect(lessonsPrompt(db, projectId, 'summary')).toBe('');
  expect(stepSharedPrompt(db, projectId, 'summary')).toBe('Be brief.');
  expect(stepSharedPrompt(db, projectId, 'implement')).toBe(
    'Be brief.\n\n# Lessons from past tickets\n\nThe user wrote these rules from their feedback on earlier tickets of this project. Follow them.\n\n- Use bun.\n- Run the checks.',
  );
  expect(stepSharedPrompt(db, otherId, 'implement')).toBe('Be brief.');
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', memory: false } })
    .where(eq(schema.projects.id, projectId))
    .run();
  expect(stepSharedPrompt(db, projectId, 'implement')).toBe('Be brief.');
  expect(listLessons(db, projectId)).toHaveLength(3);
});

test('a save is checked: known steps, non-empty one-line rules, feedback ids', () => {
  expect(
    parseLessonsSave({
      lessons: [{ section: 'implement', rule: '  Use\n bun. ' }],
      curated: [3],
    }),
  ).toEqual({ lessons: [{ section: 'implement', rule: 'Use bun.' }], curated: [3] });
  expect(parseLessonsSave({ lessons: [] })).toEqual({ lessons: [], curated: [] });
  expect(parseLessonsSave({})).toBe('"lessons" must be a list');
  expect(parseLessonsSave({ lessons: [{ section: 'rebase', rule: 'x' }] })).toBe(
    'Lesson 1 needs a step',
  );
  expect(parseLessonsSave({ lessons: [{ section: 'intake', rule: ' ' }] })).toBe(
    'Lesson 1 is empty',
  );
  expect(parseLessonsSave({ lessons: [], curated: ['1'] })).toBe(
    '"curated" must be a list of feedback ids',
  );
});

test("the spec report's lessons: added after the others, saved by the Memory page, in its own prompt", () => {
  saveLessons(db, projectId, [{ section: 'implement', rule: 'Use bun.' }]);
  const added = addLesson(db, projectId, { section: 'review_report', rule: 'Flag loan pages.' });
  expect(added).toMatchObject({ section: 'review_report', position: 1 });
  expect(reportLessonsPrompt(db, projectId)).toContain('# Lessons from past reports');
  expect(reportLessonsPrompt(db, projectId)).toContain('- Flag loan pages.');
  expect(reportLessonsPrompt(db, projectId)).not.toContain('Use bun.');
  expect(lessonsPrompt(db, projectId, 'implement')).not.toContain('Flag loan pages.');
  expect(reportLessonsPrompt(db, otherId)).toBe('');
  const save = parseLessonsSave({
    lessons: [{ section: 'review_report', rule: ' Flag  loan pages. ' }],
  });
  expect(save).toEqual({
    lessons: [{ section: 'review_report', rule: 'Flag loan pages.' }],
    curated: [],
  });
});
