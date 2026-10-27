import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  addLesson,
  createDb,
  createTicket,
  latestReport,
  migrateDb,
  queueReport,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecOptions,
  type ExecResult,
  type ReportSpec,
  type ReviewReportResult,
} from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { REPO_DIR } from './provision';
import { ReviewReportRunner } from './review-report';
import { RunSlots } from './slots';

let root: string;
let db: Db;
let ticketId: number;
let runs: AgentRun[];
let replies: string[];

/** The files of the checkout and their number of lines, as the line count script reports them. */
const CHECKOUT = new Map([
  ['api/activate.ts', 60],
  ['api/activate.test.ts', 20],
]);

const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  copyIn: () => Promise.resolve(),
  *exec(
    _container: string,
    command: string[],
    options?: ExecOptions,
  ): Generator<string, ExecResult> {
    if (command.join(' ').includes('awk')) {
      const asked = (options?.stdin ?? '').split('\n');
      yield* asked.flatMap((p) => (CHECKOUT.has(p) ? [`${p}\t${CHECKOUT.get(p)}`] : []));
    }
    return { exitCode: 0, stderr: '' };
  },
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: replies.shift() ?? '', sessionId: 's' });
};

const SPECS: ReportSpec[] = [
  { id: 1, kind: 'ticket', label: 'Ticket', text: '- Unpublish the others\n- Tooltip' },
];

const REPORT = `The change unpublishes; no tooltip.

\`\`\`json
${JSON.stringify({
  verdict: 'partial',
  summary: 'Unpublishing done, tooltip missing.',
  importantFiles: [{ path: 'api/activate.ts', why: 'The heart of it', kind: 'core' }],
  requirements: [
    {
      title: 'Unpublish',
      spec: 'Unpublish the others',
      specId: 1,
      status: 'done',
      evidence: [{ path: 'api/activate.ts', start: 40, end: 90 }],
      tests: ['api/activate.test.ts'],
    },
    { title: 'Tooltip', spec: 'Tooltip', specId: 1, status: 'missing', note: 'Not found' },
  ],
  outOfScope: [{ path: 'package.json', reason: 'bump', risk: 'low' }],
})}
\`\`\``;

function savedResult(): ReviewReportResult {
  const result = latestReport(db, { kind: 'ticket', id: ticketId })?.result;
  if (!result) {
    throw new Error('No report saved');
  }
  return result;
}

async function report(): Promise<void> {
  queueReport(db, { kind: 'ticket', id: ticketId }, SPECS);
  const runner = new ReviewReportRunner({
    db,
    runtime,
    config: { image: 'i', gitBaseUrl: 'x', credentialsPath: path.join(root, 'credentials.json') },
    slots: new RunSlots(1),
    agent,
  });
  runner.tick();
  await runner.idle();
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-report-'));
  await writeFile(path.join(root, 'credentials.json'), JSON.stringify({ claudeAiOauth: {} }));
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Campaign' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: 'h1' })
    .returning()
    .get();
  for (const [position, file] of ['api/activate.ts', 'package.json'].entries()) {
    db.insert(schema.diffFiles)
      .values({
        snapshotId: snapshot.id,
        position,
        path: file,
        oldPath: file,
        status: 'modified',
        binary: false,
        additions: 1,
        deletions: 0,
        patch: '@@ -1 +1 @@\n+x',
      })
      .run();
  }
  runs = [];
  replies = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('the agent reads the numbered specs and the change; its report is checked and kept', async () => {
  replies = [REPORT];
  await report();
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ container: 'union-t1', cwd: REPO_DIR, model: 'opus' });
  expect(runs[0]?.prompt).toContain('### Spec 1: Ticket\n\n- Unpublish the others\n- Tooltip');
  expect(runs[0]?.prompt).toContain('what needs their attention and what they can skim');
  expect(runs[0]?.prompt).toContain('git diff main...HEAD');
  expect(runs[0]?.prompt).toContain('"importantFiles"');
  expect(latestReport(db, { kind: 'ticket', id: ticketId })).toMatchObject({
    status: 'succeeded',
    headSha: 'h1',
    raw: null,
  });
  const result = savedResult();
  expect(result.verdict).toBe('partial');
  expect(result.importantFiles.map((file) => file.path)).toEqual(['api/activate.ts']);
  // The range is cut to the file's 60 lines.
  expect(result.requirements[0]).toMatchObject({
    evidence: [{ path: 'api/activate.ts', start: 40, end: 60 }],
    tests: ['api/activate.test.ts'],
  });
  expect(result.outOfScope.map((change) => change.path)).toEqual(['package.json']);
});

test('an answer without the block is asked for it once more, in the same session', async () => {
  replies = ['The report, in words only.', REPORT];
  await report();
  expect(runs).toHaveLength(2);
  expect(runs[1]).toMatchObject({ resumeSessionId: 's' });
  expect(runs[1]?.prompt).toContain('The host cannot read your report');
  expect(latestReport(db, { kind: 'ticket', id: ticketId })?.status).toBe('succeeded');
});

test("still no block: the report fails and keeps the agent's first answer", async () => {
  replies = ['The report, in words only.', 'Still words.'];
  await report();
  expect(runs).toHaveLength(2);
  expect(latestReport(db, { kind: 'ticket', id: ticketId })).toMatchObject({
    status: 'failed',
    error: "The agent's answer has no report block",
    raw: 'The report, in words only.',
  });
});

test("the project's spec report lessons are in the prompt, not the pipeline's", async () => {
  const projectId = db.select().from(schema.projects).get()?.id ?? 0;
  addLesson(db, projectId, { section: 'review_report', rule: 'Flag pages shared by loans.' });
  addLesson(db, projectId, { section: 'implement', rule: 'Run the linter.' });
  replies = [REPORT];
  await report();
  expect(runs[0]?.prompt).toContain('# Lessons from past reports');
  expect(runs[0]?.prompt).toContain('- Flag pages shared by loans.');
  expect(runs[0]?.prompt).not.toContain('Run the linter.');
});
