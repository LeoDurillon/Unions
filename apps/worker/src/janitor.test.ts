import { expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type ContainerRuntime } from '@union/core';

import { drainCommands } from './commands';
import { removeContainers } from './janitor';

test('remove_containers hands every container to the hook', () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const removed: string[] = [];
  const containers = [
    { name: 'union-t1', home: 'union-t1-home', workspace: 'union-t1-ws' },
    { name: 'bogus' },
  ];
  db.insert(schema.commands).values({ type: 'remove_containers', payload: { containers } }).run();
  drainCommands(db, {
    removeContainers: (list) => {
      removed.push(...list.map((container) => container.name));
    },
    cancelInvestigation: () => {
      // Not under test.
    },
    cancelAgentReview: () => {
      // Not under test.
    },
    cancelReviewGrouping: () => {
      // Not under test.
    },
    submitPullRequestReview: () => {
      // Not under test.
    },
    cancelPrDescription: () => {
      // Not under test.
    },
    cancelContainerRun: () => {
      // Not under test.
    },
    sendPrDescription: () => {
      // Not under test.
    },
    preview: () => {
      // Not under test.
    },
  });
  expect(removed).toEqual(['union-t1']);
  expect(db.select().from(schema.commands).get()?.error).toBeNull();
});

test('a failed removal becomes an event and the others still run', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const attempted: string[] = [];
  const runtime = {
    remove: (name: string) => {
      attempted.push(name);
      return name === 'a' ? Promise.reject(new Error('no such container')) : Promise.resolve();
    },
  } as unknown as ContainerRuntime;
  await removeContainers(db, runtime, [
    { name: 'a', home: 'a-h', workspace: 'a-w' },
    { name: 'b', home: 'b-h', workspace: 'b-w' },
  ]);
  expect(attempted).toEqual(['a', 'b']);
  const [event] = db.select().from(schema.events).all();
  expect(event).toMatchObject({ type: 'container_cleanup_failed', payload: { container: 'a' } });
});
