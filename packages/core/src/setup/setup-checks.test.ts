// Tests the checks of a setup proposal: queued from the answer, claimed, staged, finished, recovered and read back.

import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from '../db';
import { finishInvestigation } from '../investigation/investigations';
import * as schema from '../tables';
import { latestSetup, queueSetup } from './setup-agent';
import {
  claimSetupCheck,
  finishSetupCheck,
  latestSetupChecks,
  queueProposalChecks,
  queueSetupCheck,
  recoverSetupChecks,
  setSetupCheckStage,
} from './setup-checks';

const ANSWER = `Read it.

\`\`\`json
{
  "summary": "A Bun app",
  "checks": { "installCommand": "bun install", "gateCommand": "bun test", "why": "package.json" },
  "preview": {
    "composeFile": "compose.yaml",
    "services": [{ "name": "web", "port": 3000 }],
    "env": { "MODE": "preview" },
    "why": "compose.yaml"
  }
}
\`\`\``;

let db: Db;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      config: {
        baseBranch: 'main',
        preview: { composeFile: 'old.yaml', services: [], env: { KEEP: '1' } },
      },
    })
    .returning()
    .get().id;
});

function answered(result = ANSWER): number {
  const run = queueSetup(db, projectId);
  finishInvestigation(db, run.id, { status: 'succeeded', result });
  return run.id;
}

function checkEvents(): unknown[] {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, 'setup_check_changed'))
    .all()
    .map((event) => event.payload);
}

test("queues the answer's commands, and its preview as Apply would save it", () => {
  const id = answered();
  const queued = queueProposalChecks(db, id);
  expect(queued.map((check) => check.input)).toMatchObject([
    { kind: 'checks', installCommand: 'bun install', gateCommand: 'bun test' },
    {
      kind: 'preview',
      preview: { composeFile: 'compose.yaml', env: { KEEP: '1', MODE: 'preview' } },
    },
  ]);
  expect(latestSetup(db, projectId)?.checks).toMatchObject({
    checks: { status: 'queued' },
    preview: { status: 'queued' },
  });
  expect(checkEvents()).toHaveLength(2);
});

test('queues nothing for a question, a failed run, or an answer without a block', () => {
  const run = queueSetup(db, projectId);
  finishInvestigation(db, run.id, { status: 'failed', error: 'no login' });
  expect(queueProposalChecks(db, run.id)).toEqual([]);
  expect(queueProposalChecks(db, answered('Nothing to propose.'))).toEqual([]);
  expect(queueProposalChecks(db, 999)).toEqual([]);
});

test('a check still waiting takes the newer values instead of queuing a second one', () => {
  const id = answered();
  const first = queueSetupCheck(db, id, { kind: 'checks', installCommand: '', gateCommand: 'a' });
  const second = queueSetupCheck(db, id, { kind: 'checks', installCommand: '', gateCommand: 'b' });
  expect(second.id).toBe(first.id);
  expect(latestSetupChecks(db, id).checks?.input).toMatchObject({ gateCommand: 'b' });
});

test('a running check moves through its stages, then ends; the latest one is shown', () => {
  const id = answered();
  queueSetupCheck(db, id, { kind: 'checks', installCommand: 'i', gateCommand: 'g' });
  const claimed = claimSetupCheck(db);
  expect(claimed).toMatchObject({ status: 'running', stage: 'cloning' });
  expect(claimSetupCheck(db)).toBeNull();
  setSetupCheckStage(db, claimed?.id ?? 0, 'checking');
  finishSetupCheck(db, claimed?.id ?? 0, { status: 'timed_out', output: 'slow' });
  expect(latestSetupChecks(db, id).checks).toMatchObject({
    status: 'timed_out',
    stage: 'checking',
    output: 'slow',
  });
  queueSetupCheck(db, id, { kind: 'checks', installCommand: 'i', gateCommand: 'g2' });
  expect(latestSetupChecks(db, id).checks).toMatchObject({ status: 'queued' });
});

test('a stage is not set on a check that ended', () => {
  const id = answered();
  const check = queueSetupCheck(db, id, { kind: 'checks', installCommand: '', gateCommand: 'g' });
  finishSetupCheck(db, check.id, { status: 'passed', output: '' });
  setSetupCheckStage(db, check.id, 'installing');
  expect(latestSetupChecks(db, id).checks?.stage).toBeNull();
});

test('fails the checks a stopped worker left running', () => {
  const id = answered();
  queueSetupCheck(db, id, { kind: 'checks', installCommand: '', gateCommand: 'g' });
  const running = claimSetupCheck(db);
  expect(recoverSetupChecks(db)).toEqual([running?.id ?? 0]);
  expect(latestSetupChecks(db, id).checks).toMatchObject({ status: 'failed' });
});

test('says why the agent image settings would refuse the proposed Dockerfile', () => {
  answered(
    'Here.\n\n```json\n{"summary":"s","agentImage":{"dockerfile":"FROM python:3.12\\n","why":"pyproject"}}\n```',
  );
  expect(latestSetup(db, projectId)?.agentImageProblem).toContain('FROM union-agent');
  answered(
    'Here.\n\n```json\n{"summary":"s","agentImage":{"dockerfile":"FROM union-agent\\nRUN true\\n","why":"x"}}\n```',
  );
  expect(latestSetup(db, projectId)?.agentImageProblem).toBeNull();
});
