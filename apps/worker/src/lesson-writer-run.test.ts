import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  latestLessonSuggestion,
  migrateDb,
  queueLessonSuggestion,
  saveLessons,
  schema,
  type ContainerRuntime,
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

test('the writer reads the asked feedback in a throwaway container on Haiku, and its lessons wait for the user', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const feedbackId = db
    .insert(schema.feedbackEvents)
    .values({ projectId, section: 'implement', text: 'Use dayjs for dates, not Intl.' })
    .returning()
    .get().id;
  saveLessons(db, projectId, [{ section: 'test_plan', rule: 'No e2e.' }]);
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
      return Promise.resolve({
        kind: 'ok',
        sessionId: 's',
        text: '[{"section": "implement", "rule": "Format dates with dayjs."}]',
      });
    },
  });
  try {
    const row = queueLessonSuggestion(db, projectId, [feedbackId]);
    runner.tick();
    await runner.idle();
    expect(runs[0]?.model).toBe('haiku');
    expect(runs[0]?.prompt).toContain('Use dayjs for dates, not Intl.');
    expect(runs[0]?.prompt).toContain('- [test_plan] No e2e.');
    expect(calls).toContain(`create union-lesson-writer-${row.id}`);
    expect(calls.at(-1)).toBe(`remove union-lesson-writer-${row.id}`);
    expect(latestLessonSuggestion(db, projectId)).toMatchObject({
      status: 'ready',
      suggestions: [{ section: 'implement', rule: 'Format dates with dayjs.' }],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
