import { beforeEach, expect, test } from 'bun:test';

import { addTool, AgentToolError, listTools, removeTool } from './agent-tools';
import { resetAgent, resolveAgent, saveAgent, toolsFor } from './agents';
import { createDb, migrateDb, type Db } from './db';

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

test('the list has the built-in tools, the rules the defaults use, then the added ones', () => {
  const names = listTools(db).map((tool) => tool.name);
  expect(names).toContain('Skill');
  expect(names).toContain('Bash(git diff*)');
  addTool(db, { name: ' Bash(pnpm test*) ', description: 'Run the tests' });
  addTool(db, { name: 'mcp__notion__search' });
  expect(listTools(db).slice(-2)).toEqual([
    { name: 'Bash(pnpm test*)', description: 'Run the tests', source: 'custom' },
    { name: 'mcp__notion__search', description: null, source: 'custom' },
  ]);
});

test('bad names, duplicates and built-ins are refused', () => {
  const refused = ['', 'two words', 'Bash(a, b)', 'Bash(x', '1Tool', 'Read'].map((name) => {
    try {
      addTool(db, { name });
      return null;
    } catch (error) {
      return error instanceof AgentToolError ? error.message : String(error);
    }
  });
  expect(refused.filter((message) => message === null)).toEqual([]);
  expect(refused.at(-1)).toBe('Read is already in the list');
  expect(() => {
    removeTool(db, 'Read');
  }).toThrow(AgentToolError);
});

test('an agent runs with its selected tools; reset brings the defaults back', () => {
  addTool(db, { name: 'Bash(pnpm lint*)' });
  const { prompt, model } = resolveAgent(db, 'implement');
  saveAgent(db, 'implement', {
    prompt,
    model,
    tools: ['Skill', 'Read', 'Bash(pnpm lint*)', 'Read'],
  });
  // Deduplicated, in the list's order.
  expect(toolsFor(db, 'implement')).toEqual(['Read', 'Skill', 'Bash(pnpm lint*)']);
  expect(() => {
    removeTool(db, 'Bash(pnpm lint*)');
  }).toThrow('still selected for: implement');

  resetAgent(db, 'implement');
  expect(toolsFor(db, 'implement')).toEqual(['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash']);
  removeTool(db, 'Bash(pnpm lint*)');
  expect(listTools(db).some((tool) => tool.source === 'custom')).toBe(false);
});

test('unknown or empty selections are refused; agents without a step store no tools', () => {
  const { prompt, model } = resolveAgent(db, 'summary');
  expect(() => saveAgent(db, 'summary', { prompt, model, tools: ['Teleport'] })).toThrow(
    'Unknown tools: Teleport',
  );
  expect(() => saveAgent(db, 'summary', { prompt, model, tools: [] })).toThrow('at least one');
  saveAgent(db, 'shared', { prompt: 'rules', model: null, tools: ['Read'] });
  expect(resolveAgent(db, 'shared').tools).toBeNull();
  // Saving only the prompt keeps the default tools.
  saveAgent(db, 'summary', { prompt: 'short', model });
  expect(toolsFor(db, 'summary')).toEqual(['Read', 'Grep', 'Glob']);
});
