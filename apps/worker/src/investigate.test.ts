import { beforeEach, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  askFollowUp,
  claimInvestigation,
  createInvestigation,
  createDb,
  finishInvestigation,
  getInvestigation,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type Investigation,
  type Project,
} from '@union/core';

import type { AgentFn, AgentOutcome, AgentRun } from './agent';
import { drainCommands } from './commands';
import { InvestigationRunner, investigationPrompt } from './investigate';
import { RunSlots } from './slots';

let db: Db;
let project: Project;
let calls: string[];
let runs: AgentRun[];
let credentialsPath: string;

/** Records what happens to containers; nothing is run. */
const runtime = {
  create: ({ name }: { name: string }) => {
    calls.push(`create ${name}`);
    return Promise.resolve();
  },
  start: (name: string) => {
    calls.push(`start ${name}`);
    return Promise.resolve();
  },
  writeFile: (_name: string, file: string) => {
    calls.push(`write ${file}`);
    return Promise.resolve();
  },
  remove: (name: string, volumes?: { home: string; workspace: string }) => {
    calls.push(`remove ${name} ${volumes?.home ?? ''} ${volumes?.workspace ?? ''}`);
    return Promise.resolve();
  },
} as unknown as ContainerRuntime;

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'develop' } })
    .returning()
    .get();
  calls = [];
  runs = [];
  const dir = await mkdtemp(path.join(tmpdir(), 'union-investigate-'));
  credentialsPath = path.join(dir, 'credentials.json');
  await writeFile(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }));
});

function runner(agent: AgentFn, slots = new RunSlots(2)): InvestigationRunner {
  return new InvestigationRunner({
    db,
    runtime,
    config: { image: 'img', gitBaseUrl: 'https://github.com', credentialsPath },
    slots,
    agent,
  });
}

function queue(scope: Investigation['scope'] = 'global'): Investigation {
  return createInvestigation(db, {
    projectId: project.id,
    title: 'Compare queues',
    prompt: 'Which queue library fits us?',
    scope,
    model: 'sonnet',
    tools: ['WebSearch'],
  });
}

const answer: AgentFn = (_runtime, run) => {
  runs.push(run);
  run.onEvent({ type: 'system', subtype: 'init' });
  return Promise.resolve({ kind: 'ok', text: '## Answer', sessionId: 's' });
};

test('runs a global investigation in a throwaway container and saves the answer', async () => {
  const { id } = queue();
  const investigations = runner(answer);
  investigations.tick();
  await investigations.idle();

  expect(getInvestigation(db, id)).toMatchObject({ status: 'succeeded', result: '## Answer' });
  expect(runs[0]).toMatchObject({
    container: `union-i${id}`,
    cwd: '/workspace',
    model: 'sonnet',
    tools: ['WebSearch'],
  });
  expect(calls[0]).toBe(`create union-i${id}`);
  expect(calls.at(-1)).toBe(`remove union-i${id} union-i${id}-home union-i${id}-ws`);
  const logged = db.select().from(schema.agentLog).all();
  expect(logged.map((line) => [line.investigationId, line.ticketId])).toEqual([[id, null]]);
});

test('a cancelled run ends cancelled and its container is removed', async () => {
  const { id } = queue();
  let investigations: InvestigationRunner | null = null;
  const waitForAbort: AgentFn = (_runtime, run) => {
    runs.push(run);
    const killed = new Promise<AgentOutcome>((resolve) => {
      run.signal?.addEventListener('abort', () => {
        resolve({ kind: 'error', message: 'killed' });
      });
    });
    investigations?.cancel(id);
    return killed;
  };
  investigations = runner(waitForAbort);
  investigations.tick();
  await investigations.idle();

  expect(runs).toHaveLength(1);
  expect(getInvestigation(db, id).status).toBe('cancelled');
  expect(calls.at(-1)).toStartWith(`remove union-i${id}`);
});

test('cancelling before the agent starts skips it', async () => {
  const { id } = queue();
  const investigations = runner(answer);
  investigations.tick();
  investigations.cancel(id);
  await investigations.idle();

  expect(runs).toEqual([]);
  expect(getInvestigation(db, id).status).toBe('cancelled');
});

test('a failure is saved with its message and frees the slot', async () => {
  const first = queue();
  const second = queue();
  const slots = new RunSlots(1);
  const investigations = runner(
    () => Promise.resolve({ kind: 'rate_limited', message: 'usage limit' }),
    slots,
  );
  investigations.tick();
  expect(getInvestigation(db, second.id).status).toBe('queued');
  await investigations.idle();
  expect(getInvestigation(db, first.id)).toMatchObject({ status: 'failed' });
  expect(getInvestigation(db, first.id).error).toContain('usage limit');

  investigations.tick();
  await investigations.idle();
  expect(getInvestigation(db, second.id).status).toBe('failed');
});

test('recover fails runs a stopped worker left behind and removes their containers', async () => {
  const { id } = queue();
  claimInvestigation(db);
  await runner(answer).recover();
  expect(getInvestigation(db, id)).toMatchObject({ status: 'failed' });
  expect(calls).toEqual([`remove union-i${id} union-i${id}-home union-i${id}-ws`]);
});

test('the prompt says where the code is, or that there is none', () => {
  const repository = investigationPrompt(queue('repository'), project);
  expect(repository).toStartWith('Which queue library fits us?');
  expect(repository).toContain(
    'acme/shop is checked out at /workspace/repo on its `develop` branch',
  );
  expect(investigationPrompt(queue('global'), project)).toContain('No repository is checked out');
  expect(repository).not.toContain('follows up');
});

test('the prompt carries the project instructions when there are some', () => {
  const own = { ...project, config: { ...project.config, instructions: 'Answer in French.' } };
  expect(investigationPrompt(queue(), own)).toContain(
    '---\n# Project instructions\n\nAnswer in French.\n\nNo repository',
  );
  expect(investigationPrompt(queue(), project)).not.toContain('Project instructions');
});

test('a follow-up prompt carries the earlier questions and answers', () => {
  const { id } = queue();
  claimInvestigation(db);
  finishInvestigation(db, id, { status: 'succeeded', result: 'Use BullMQ' });
  const prompt = investigationPrompt(askFollowUp(db, id, 'Does it need Redis?'), project);
  expect(prompt).toStartWith('This follows up on an earlier investigation.');
  expect(prompt).toContain(
    '<question>\nWhich queue library fits us?\n</question>\n<answer>\nUse BullMQ\n</answer>',
  );
  expect(prompt).toContain('The follow-up question:\n\nDoes it need Redis?\n\n---');
});

test('the cancel command cancels a queued run itself and hands a running one to the runner', () => {
  const running = queue();
  claimInvestigation(db);
  const queued = queue();
  const cancelled: number[] = [];
  for (const { id } of [queued, running]) {
    db.insert(schema.commands)
      .values({ type: 'cancel_investigation', payload: { investigationId: id } })
      .run();
  }
  drainCommands(db, {
    removeContainers: () => {
      // Not under test.
    },
    cancelInvestigation: (id) => {
      cancelled.push(id);
    },
    cancelAgentReview: () => {
      // Not under test.
    },
    cancelReviewGrouping: () => {
      // Not under test.
    },
    cancelReviewExplanation: () => {
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
    rerunCiJob: () => {
      // Not under test.
    },
    preview: () => {
      // Not under test.
    },
  });
  expect(cancelled).toEqual([running.id]);
  expect(getInvestigation(db, queued.id).status).toBe('cancelled');
  expect(getInvestigation(db, running.id).status).toBe('running');
});
