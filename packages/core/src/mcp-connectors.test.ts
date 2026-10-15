import { expect, test } from 'bun:test';

import { listTools } from './agent-tools';
import { createDb, migrateDb } from './db';
import {
  claimConnectorCheck,
  connectorTool,
  finishConnectorCheck,
  isConnectorTool,
  latestConnectorCheck,
  parseMcpList,
  queueConnectorCheck,
  replaceConnectors,
} from './mcp-connectors';

const LIST = `Checking MCP server health…

claude.ai Claude Docs: https://api.anthropic.com/v1/pages/mcp - ✔ Connected
claude.ai Figma: https://mcp.figma.com/mcp - ✔ Connected
claude.ai Linear: https://mcp.linear.app/mcp - ! Needs authentication
local-server: npx some-server - ✔ Connected`;

test("claude mcp list's connectors are read with their state; other servers are not", () => {
  expect(parseMcpList(LIST)).toEqual([
    {
      name: 'Claude Docs',
      url: 'https://api.anthropic.com/v1/pages/mcp',
      status: '✔ Connected',
      connected: true,
    },
    { name: 'Figma', url: 'https://mcp.figma.com/mcp', status: '✔ Connected', connected: true },
    {
      name: 'Linear',
      url: 'https://mcp.linear.app/mcp',
      status: '! Needs authentication',
      connected: false,
    },
  ]);
});

test("a connector's tools are named the way Claude Code names them", () => {
  expect(connectorTool('Figma')).toBe('mcp__claude_ai_Figma');
  expect(connectorTool('Claude Docs')).toBe('mcp__claude_ai_Claude_Docs');
  expect(isConnectorTool('mcp__claude_ai_Figma')).toBe(true);
  expect(isConnectorTool('mcp__notion__search')).toBe(false);
});

test('the connectors read last are offered as tools; a check runs one at a time', () => {
  const db = createDb(':memory:');
  migrateDb(db);
  replaceConnectors(db, parseMcpList(LIST));
  const tools = listTools(db).filter((tool) => tool.source === 'connector');
  expect(tools.map((tool) => tool.name)).toEqual([
    'mcp__claude_ai_Claude_Docs',
    'mcp__claude_ai_Figma',
    'mcp__claude_ai_Linear',
  ]);
  const first = queueConnectorCheck(db);
  expect(queueConnectorCheck(db).id).toBe(first.id);
  expect(claimConnectorCheck(db)?.id).toBe(first.id);
  expect(claimConnectorCheck(db)).toBeNull();
  finishConnectorCheck(db, first.id, 'docker failed');
  expect(latestConnectorCheck(db)).toMatchObject({ status: 'failed', error: 'docker failed' });
  expect(queueConnectorCheck(db).id).not.toBe(first.id);
});
