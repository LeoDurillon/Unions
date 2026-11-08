// Tests of the event stream's liveness: it says it is open at once, and pings while quiet.
import { expect, test } from 'bun:test';

import { createDb, migrateDb } from '@union/core';

import { eventRoutes } from './events';

const HEARTBEAT_MS = 50;

test('a quiet stream opens with a comment, then sends a named ping a page can listen for', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const response = await eventRoutes(db, HEARTBEAT_MS).request('/?after=latest');
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes('event: ping')) {
    const chunk = await reader?.read();
    if (!chunk || chunk.done) {
      break;
    }
    text += decoder.decode(chunk.value);
  }
  await reader?.cancel();
  expect(text.startsWith(': open\n\n')).toBe(true);
  expect(text).toContain('event: ping\ndata: alive\n\n');
});
