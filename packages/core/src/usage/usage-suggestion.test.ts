// Tests queuing a "Suggest improvements" investigation from a project's usage findings.

import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import { InvestigationError } from '../investigation/investigations';
import * as schema from '../tables';
import { suggestImprovements } from './usage-suggestion';

let db: Db;
let projectId: number;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = db
    .insert(schema.tickets)
    .values({ projectId, title: 'Add search', body: '' })
    .returning()
    .get().id;
});

function loadSkill(times: number): void {
  db.insert(schema.agentToolUsage)
    .values({
      resultLineId: 1,
      ticketId,
      sessionId: 's1',
      tool: 'Skill',
      target: 'gitmoji-commit',
      variant: '',
      subagent: false,
      calls: times,
      errors: 0,
      denied: 0,
      resultBytes: 0,
    })
    .run();
}

test('nothing standing out queues nothing', () => {
  expect(() => suggestImprovements(db, projectId, null)).toThrow(InvestigationError);
  expect(db.select().from(schema.investigations).all()).toEqual([]);
});

test('the findings are asked of a read-only repository investigation', () => {
  loadSkill(12);
  const investigation = suggestImprovements(db, projectId, 30);
  expect(investigation).toMatchObject({
    title: 'Suggest improvements from usage over the last 30 days',
    scope: 'repository',
    status: 'queued',
    model: 'opus',
    tools: ['Read', 'Grep', 'Glob'],
  });
  expect(investigation.prompt).toContain('### Skills loaded again and again (for the repository)');
  expect(investigation.prompt).toContain(
    '- `gitmoji-commit`: loaded 12 times; seen most in ticket 1',
  );
  expect(investigation.prompt).toContain('- ticket 1: Add search');
  expect(investigation.prompt).toContain('## Changes to the repository');
});
