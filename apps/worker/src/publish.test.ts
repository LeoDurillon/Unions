import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  getTicket,
  gitBlobId,
  migrateDb,
  schema,
  setParent,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { hostGit } from './provision';
import { assertNoPrivateFiles, pullRequestBody } from './publish';

test('a PR stacked on the parent branch names the parent PR', () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const parent = createTicket(db, { projectId: project.id, title: 'parent' }).id;
  const child = createTicket(db, { projectId: project.id, title: 'child' }).id;
  setParent(db, child, parent);
  db.update(schema.tickets)
    .set({ branch: '12-parent', prNumber: 40 })
    .where(eq(schema.tickets.id, parent))
    .run();
  db.update(schema.tickets).set({ issueNumber: 13 }).where(eq(schema.tickets.id, child)).run();

  // Parent branch already merged and deleted: the child was cloned from main.
  expect(pullRequestBody(db, getTicket(db, child))).toBe('Closes #13');

  db.update(schema.tickets)
    .set({ baseBranch: '12-parent' })
    .where(eq(schema.tickets.id, child))
    .run();
  expect(pullRequestBody(db, getTicket(db, child))).toBe(
    'Closes #13\n\nBuilds on #40, which it targets: merge that one first.',
  );
});

test('a branch holding a private attachment is refused before the push', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'union-private-'));
  try {
    const git = (args: string[]): Promise<string> => hostGit(['-C', dir, ...args], null);
    await hostGit(['init', '--quiet', dir], null);
    await writeFile(path.join(dir, 'kept.txt'), 'fine\n');
    await git(['add', '.']);
    await git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'one']);
    const secret = new TextEncoder().encode('customer data\n');
    const privateFile = { name: 'orders.csv', blobId: gitBlobId(secret) };
    expect(assertNoPrivateFiles(dir, [privateFile])).resolves.toBeUndefined();

    // Committed then deleted: still in the history that would be pushed.
    await writeFile(path.join(dir, 'fixture.csv'), secret);
    await git(['add', '.']);
    await git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'two']);
    await git(['rm', '--quiet', 'fixture.csv']);
    await git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'three']);
    expect(assertNoPrivateFiles(dir, [privateFile])).rejects.toThrow(
      'The branch contains the attached file `orders.csv`',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
