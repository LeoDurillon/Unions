import { expect, test } from 'bun:test';

import {
  createDb,
  latestConnectorCheck,
  listConnectors,
  migrateDb,
  queueConnectorCheck,
  type ContainerRuntime,
} from '@union/core';

import { claudeArgs, connectorEnv } from './agent';
import { ConnectorChecker } from './mcp-check';
import type { ProvisionConfig } from './provision';

test('a run loads the claude.ai connectors only when its tools include one', () => {
  expect(connectorEnv(['Read', 'Bash'])).toEqual({ ENABLE_CLAUDEAI_MCP_SERVERS: 'false' });
  expect(connectorEnv(['Read', 'mcp__claude_ai_Figma'])).toEqual({
    ENABLE_CLAUDEAI_MCP_SERVERS: 'true',
  });
  const args = claudeArgs({ model: 'opus', tools: ['Read', 'mcp__claude_ai_Figma'] });
  expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read,mcp__claude_ai_Figma');
});

test('a run with Figma is told to take screenshots inline; other runs are told nothing', () => {
  const figma = claudeArgs({ model: 'opus', tools: ['Read', 'mcp__claude_ai_Figma'] });
  expect(figma[figma.indexOf('--append-system-prompt') + 1]).toContain(
    'enableBase64Response: true',
  );
  expect(claudeArgs({ model: 'opus', tools: ['Read', 'Bash'] })).not.toContain(
    '--append-system-prompt',
  );
});

test('a queued check replaces the connectors with the ones read; a failure keeps them', async () => {
  const db = createDb(':memory:');
  migrateDb(db);
  let fail = false;
  const checker = new ConnectorChecker({
    db,
    runtime: {} as ContainerRuntime,
    config: {} as ProvisionConfig,
    read: () =>
      fail
        ? Promise.reject(new Error('docker is down'))
        : Promise.resolve([
            {
              name: 'Figma',
              url: 'https://mcp.figma.com/mcp',
              status: '✔ Connected',
              connected: true,
            },
          ]),
  });
  queueConnectorCheck(db);
  checker.tick();
  await checker.idle();
  expect(listConnectors(db).map((connector) => connector.name)).toEqual(['Figma']);
  expect(latestConnectorCheck(db)?.status).toBe('succeeded');
  fail = true;
  queueConnectorCheck(db);
  checker.tick();
  await checker.idle();
  expect(latestConnectorCheck(db)).toMatchObject({ status: 'failed', error: 'docker is down' });
  expect(listConnectors(db)).toHaveLength(1);
});
