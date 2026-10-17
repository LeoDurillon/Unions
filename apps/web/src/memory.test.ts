import { beforeEach, expect, test } from 'bun:test';

import { createDb, listFeedback, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function send(method: string, path: string, body: unknown): Response | Promise<Response> {
  return app.request(`/api/projects/${projectId}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function insertFeedback(text: string): number {
  return db
    .insert(schema.feedbackEvents)
    .values({ projectId, section: 'implement', text })
    .returning()
    .get().id;
}

test('lessons are saved whole, read back in order, and curate the feedback they come from', async () => {
  const feedbackId = insertFeedback('Use bun, not npm.');
  const saved = await send('PUT', '/lessons', {
    lessons: [{ section: 'implement', rule: 'Use bun.' }],
    curated: [feedbackId],
  });
  expect(saved.status).toBe(200);
  const read = await app.request(`/api/projects/${projectId}/lessons`);
  expect(await read.json()).toMatchObject([{ section: 'implement', rule: 'Use bun.' }]);
  expect(listFeedback(db, projectId)[0]?.curatedAt).toBeNumber();
});

test('a lesson without a step or rule is refused', async () => {
  const response = await send('PUT', '/lessons', { lessons: [{ section: 'implement' }] });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: 'Lesson 1 is empty' });
});

test('feedback is listed, dismissed and restored', async () => {
  const feedbackId = insertFeedback('Shorter summaries.');
  const listed = await app.request(`/api/projects/${projectId}/feedback`);
  expect(await listed.json()).toMatchObject([{ id: feedbackId, curatedAt: null }]);
  expect((await send('PATCH', `/feedback/${feedbackId}`, { curated: true })).status).toBe(200);
  expect(listFeedback(db, projectId)[0]?.curatedAt).toBeNumber();
  expect((await send('PATCH', `/feedback/${feedbackId}`, { curated: false })).status).toBe(200);
  expect(listFeedback(db, projectId)[0]?.curatedAt).toBeNull();
  expect((await send('PATCH', '/feedback/999', { curated: true })).status).toBe(404);
});
