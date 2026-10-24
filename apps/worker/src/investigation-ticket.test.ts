import { beforeEach, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  askFollowUp,
  claimInvestigation,
  createDb,
  createInvestigation,
  finishInvestigation,
  getInvestigation,
  getTicket,
  migrateDb,
  requestTicket,
  saveNotionConnection,
  schema,
  type ContainerRuntime,
  type Db,
  type NotionApi,
  type Project,
} from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { InvestigationRunner } from './investigate';
import { parseTicketDraft, ticketPrompt } from './investigation-ticket';
import { RunSlots } from './slots';

let db: Db;
let project: Project;
let calls: string[];
let credentialsPath: string;
let id: number;

const runtime = {
  create: ({ name }: { name: string }) => {
    calls.push(`create ${name}`);
    return Promise.resolve();
  },
  start: () => Promise.resolve(),
  writeFile: () => Promise.resolve(),
  remove: (name: string) => {
    calls.push(`remove ${name}`);
    return Promise.resolve();
  },
} as unknown as ContainerRuntime;

function answered(result: string): void {
  claimInvestigation(db);
  finishInvestigation(db, id, { status: 'succeeded', result });
}

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get();
  calls = [];
  const dir = await mkdtemp(path.join(tmpdir(), 'union-ticket-draft-'));
  credentialsPath = path.join(dir, 'credentials.json');
  await writeFile(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }));
  ({ id } = createInvestigation(db, {
    projectId: project.id,
    title: 'Lenteur du login',
    prompt: 'Pourquoi le login est lent ?',
    scope: 'repository',
    model: 'sonnet',
    tools: ['Read'],
  }));
  answered('Une requête N+1.');
  askFollowUp(db, id, 'Où exactement ?');
  answered('Dans auth.ts, ligne 40.');
});

function runner(agent: AgentFn, notion?: NotionApi): InvestigationRunner {
  return new InvestigationRunner({
    db,
    runtime,
    config: { image: 'img', gitBaseUrl: 'https://github.com', credentialsPath },
    slots: new RunSlots(2),
    agent,
    notion,
  });
}

test('the prompt carries every question and answer, and what the user wants covered', () => {
  requestTicket(db, id, 'Seulement le correctif backend');
  const prompt = ticketPrompt(getInvestigation(db, id), project);
  expect(prompt).toContain(
    '<question>\nPourquoi le login est lent ?\n</question>\n<answer>\nUne requête N+1.\n</answer>',
  );
  expect(prompt).toContain(
    '<question>\nOù exactement ?\n</question>\n<answer>\nDans auth.ts, ligne 40.\n</answer>',
  );
  expect(prompt).toContain('# What the ticket must cover\n\nSeulement le correctif backend');
  expect(prompt).toContain("in the language of the user's questions above");
});

test('the title comes from the first heading, the rest is the body', () => {
  const investigation = getInvestigation(db, id);
  expect(
    parseTicketDraft('# Corriger la requête N+1\n\n## Problème\nLent.', investigation),
  ).toEqual({
    title: 'Corriger la requête N+1',
    body: '## Problème\nLent.\n\n---\nWritten from the investigation "Lenteur du login".',
  });
  expect(parseTicketDraft('', investigation).title).toBe('Lenteur du login');
});

test('the ticket is written in a throwaway container and lands in the backlog', async () => {
  requestTicket(db, id, '');
  const runs: AgentRun[] = [];
  const writes: AgentFn = (_runtime, run) => {
    runs.push(run);
    return Promise.resolve({
      kind: 'ok',
      text: '# Corriger la requête N+1\n\nDétails.',
      sessionId: 's',
    });
  };
  const investigations = runner(writes);
  investigations.tick();
  await investigations.idle();

  const investigation = getInvestigation(db, id);
  expect(investigation.ticketStatus).toBeNull();
  expect(getTicket(db, investigation.ticketId ?? 0)).toMatchObject({
    title: 'Corriger la requête N+1',
  });
  expect(runs[0]).toMatchObject({ container: `union-i${id}-ticket`, model: 'sonnet', tools: [] });
  // A stopped worker's leftover is cleared first, then the container is removed after the run.
  expect(calls).toEqual([
    `remove union-i${id}-ticket`,
    `create union-i${id}-ticket`,
    `remove union-i${id}-ticket`,
  ]);
});

test('a failed agent keeps the error and no ticket is made', async () => {
  requestTicket(db, id, '');
  const investigations = runner(() =>
    Promise.resolve({ kind: 'rate_limited', message: 'usage limit' }),
  );
  investigations.tick();
  await investigations.idle();
  expect(getInvestigation(db, id)).toMatchObject({
    ticketStatus: 'failed',
    ticketError: 'usage limit',
    ticketId: null,
  });
  expect(db.select().from(schema.tickets).all()).toEqual([]);
});

const writesTicket: AgentFn = () =>
  Promise.resolve({ kind: 'ok', text: '# Fix login\n\nDetails.', sessionId: 's' });

function connectNotion(): void {
  saveNotionConnection(db, project.id, { token: 'secret', dataSourceId: 'source' });
}

test('asked in Notion, the ticket is created as a page of the data source and linked to it', async () => {
  connectNotion();
  requestTicket(db, id, '', { target: 'notion' });
  const pages: unknown[] = [];
  const notion = {
    createPage: (token: string, dataSourceId: string, page: { title: string }) => {
      pages.push({ token, dataSourceId, title: page.title });
      return Promise.resolve({ id: 'page-1', title: page.title, url: '', dataSourceId });
    },
  } as unknown as NotionApi;
  const investigations = runner(writesTicket, notion);
  investigations.tick();
  await investigations.idle();

  expect(pages).toEqual([{ token: 'secret', dataSourceId: 'source', title: 'Fix login' }]);
  const investigation = getInvestigation(db, id);
  expect(investigation.ticketError).toBeNull();
  expect(getTicket(db, investigation.ticketId ?? 0)).toMatchObject({
    originKind: 'notion',
    originId: 'page-1',
  });
});

test('a Notion failure still creates the ticket, and says why it has no page', async () => {
  connectNotion();
  requestTicket(db, id, '', { target: 'notion' });
  const notion = {
    createPage: () => Promise.reject(new Error('Notion: validation error')),
  } as unknown as NotionApi;
  const investigations = runner(writesTicket, notion);
  investigations.tick();
  await investigations.idle();

  const investigation = getInvestigation(db, id);
  expect(investigation.ticketStatus).toBeNull();
  expect(investigation.ticketError).toBe(
    'The ticket was created, but not in Notion: Notion: validation error',
  );
  expect(getTicket(db, investigation.ticketId ?? 0).originKind).toBeNull();
});
