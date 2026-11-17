import { expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import {
  claudeToken,
  claudeTokenProblem,
  claudeTokenStatus,
  deleteClaudeToken,
  saveClaudeToken,
} from './claude-token';

const TOKEN = `sk-ant-oat01-${'a'.repeat(40)}`;

function freshDb(): Db {
  const db = createDb(':memory:');
  migrateDb(db);
  return db;
}

test('accepts what claude setup-token prints, and names what else was pasted', () => {
  expect(claudeTokenProblem(TOKEN)).toBeNull();
  expect(claudeTokenProblem(`sk-ant-ort01-${'a'.repeat(40)}`)).toContain('refresh token');
  expect(claudeTokenProblem(`sk-ant-api03-${'a'.repeat(40)}`)).toContain('API key');
  expect(claudeTokenProblem('hello')).toContain('Not a Claude token');
  expect(claudeTokenProblem(`${TOKEN} extra`)).toContain('Not a Claude token');
});

test('saves, replaces and removes the one token; the status never holds it', () => {
  const db = freshDb();
  expect(claudeToken(db)).toBeNull();
  expect(claudeTokenStatus(db)).toEqual({ configured: false });
  saveClaudeToken(db, TOKEN);
  saveClaudeToken(db, `${TOKEN}b`);
  expect(claudeToken(db)).toBe(`${TOKEN}b`);
  const status = claudeTokenStatus(db);
  expect(status.configured).toBe(true);
  expect(JSON.stringify(status)).not.toContain('sk-ant');
  deleteClaudeToken(db);
  expect(claudeToken(db)).toBeNull();
});
