import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  latestLessonSuggestion,
  migrateDb,
  queueLessonSuggestion,
  queueLessonTidy,
  saveLessons,
  schema,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import type { AgentRun } from './agent';
import { LessonWriterRunner } from './lesson-writer-run';
import type { ProvisionConfig } from './provision';
import { RunSlots } from './slots';

/** Records what the runner asks of Docker; every call succeeds. */
function fakeRuntime(calls: string[]): ContainerRuntime {
  const record =
    (name: string) =>
    (container: string): Promise<void> => {
      calls.push(`${name} ${container}`);
      return Promise.resolve();
    };
  return {
    create: (spec: { name: string }) => record('create')(spec.name),
    start: record('start'),
    remove: record('remove'),
    writeFile: record('writeFile'),
  } as unknown as ContainerRuntime;
}

type Setup = {
  db: Db;
  projectId: number;
  keptId: number;
  calls: string[];
  runs: AgentRun[];
  runner: LessonWriterRunner;
  dir: string;
};

/** A project with one lesson, and a runner whose agent answers `answer(keptId)`. */
async function setup(answer: (keptId: number) => string): Promise<Setup> {
  const db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const [kept] = saveLessons(db, projectId, [{ section: 'test_plan', rule: 'No e2e.' }]);
  const keptId = kept?.id ?? 0;
  const dir = await mkdtemp(path.join(tmpdir(), 'union-lesson-writer-'));
  const credentialsPath = path.join(dir, 'credentials.json');
  await writeFile(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }));
  const calls: string[] = [];
  const runs: AgentRun[] = [];
  const runner = new LessonWriterRunner({
    db,
    runtime: fakeRuntime(calls),
    config: { image: 'img', credentialsPath } as ProvisionConfig,
    slots: new RunSlots(1),
    agent: (_runtime, run) => {
      runs.push(run);
      return Promise.resolve({ kind: 'ok', sessionId: 's', text: answer(keptId) });
    },
  });
  return { db, projectId, keptId, calls, runs, runner, dir };
}

test('the writer reads the asked feedback in a throwaway container on Haiku, and its lessons wait for the user', async () => {
  const { db, projectId, keptId, calls, runs, runner, dir } = await setup(
    (id) =>
      `[{"section": "implement", "rule": "Format dates with dayjs.", "replaces": [${id}, 999]}]`,
  );
  const feedbackId = db
    .insert(schema.feedbackEvents)
    .values({ projectId, section: 'implement', text: 'Use dayjs for dates, not Intl.' })
    .returning()
    .get().id;
  try {
    const row = queueLessonSuggestion(db, projectId, [feedbackId]);
    runner.tick();
    await runner.idle();
    expect(runs[0]?.model).toBe('haiku');
    expect(runs[0]?.prompt).toContain('Use dayjs for dates, not Intl.');
    expect(runs[0]?.prompt).toContain(`- #${keptId} [test_plan] No e2e.`);
    expect(calls).toContain(`create union-lesson-writer-${row.id}`);
    expect(calls.at(-1)).toBe(`remove union-lesson-writer-${row.id}`);
    expect(latestLessonSuggestion(db, projectId)).toMatchObject({
      status: 'ready',
      suggestions: [{ section: 'implement', rule: 'Format dates with dayjs.', replaces: [keptId] }],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the tidier reads the lessons on Sonnet, and keeps only proposals that change kept lessons', async () => {
  const { db, projectId, keptId, runs, runner, dir } = await setup((id) =>
    JSON.stringify([
      { section: 'implement', rule: 'A new rule.', replaces: [] },
      { section: 'technical', rule: '', replaces: [id], why: 'Held for one ticket.' },
    ]),
  );
  try {
    queueLessonTidy(db, projectId);
    runner.tick();
    await runner.idle();
    expect(runs[0]?.model).toBe('sonnet');
    expect(runs[0]?.prompt).toContain(`- #${keptId} [test_plan] No e2e.`);
    expect(runs[0]?.prompt).toContain('You tidy the lessons');
    expect(latestLessonSuggestion(db, projectId)).toMatchObject({
      kind: 'tidy',
      status: 'ready',
      suggestions: [
        { section: 'technical', rule: '', replaces: [keptId], why: 'Held for one ticket.' },
      ],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
