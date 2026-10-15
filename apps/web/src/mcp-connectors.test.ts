import { expect, test } from 'bun:test';

import { createDb, migrateDb, replaceConnectors } from '@union/core';

import type { ConnectorsResponse } from './api-types';
import { createApp } from './app';

test('the connectors come with their tool; asking for a check queues one', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  const app = createApp(db);
  const empty = (await (await app.request('/api/agents/connectors')).json()) as ConnectorsResponse;
  expect(empty).toEqual({ connectors: [], check: null });
  const queued = await app.request('/api/agents/connectors/check', { method: 'POST' });
  expect(queued.status).toBe(202);
  expect(((await queued.json()) as ConnectorsResponse).check?.status).toBe('queued');
  replaceConnectors(db, [
    { name: 'Figma', url: 'https://mcp.figma.com/mcp', status: '✔ Connected', connected: true },
  ]);
  const listed = (await (await app.request('/api/agents/connectors')).json()) as ConnectorsResponse;
  expect(listed.connectors.map((connector) => [connector.name, connector.tool])).toEqual([
    ['Figma', 'mcp__claude_ai_Figma'],
  ]);
  const tools = (await (await app.request('/api/agents/tools')).json()) as {
    name: string;
    source: string;
  }[];
  expect(tools.find((tool) => tool.name === 'mcp__claude_ai_Figma')?.source).toBe('connector');
});
