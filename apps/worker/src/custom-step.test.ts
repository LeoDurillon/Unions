import { beforeEach, expect, test } from 'bun:test';

import {
  claimCustomAgentPrompt,
  createCustomAgent,
  createDb,
  createTicket,
  customStep,
  finishCustomAgentPrompt,
  migrateDb,
  saveOutput,
  schema,
  type CustomStep,
  type Db,
  type PipelineStep,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { approvedBefore } from './approved';
import { runsAfterImplement } from './custom-step';
import { renderStepComment } from './github/render';
import { buildPrompt } from './prompts';

let db: Db;
let security: CustomStep;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const agent = createCustomAgent(db, { name: 'Security pass', role: 'Look for risks' });
  claimCustomAgentPrompt(db);
  finishCustomAgentPrompt(db, agent.id, { prompt: 'Check security.' });
  security = customStep(agent.id);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function ticketOn(flow: PipelineStep[]): Ticket {
  return createTicket(db, { projectId, title: 't', flow });
}

function approve(ticketId: number, step: PipelineStep, content: string): void {
  const output = saveOutput(db, ticketId, step, content);
  db.update(schema.stepOutputs)
    .set({ validation: 'approved' })
    .where(eq(schema.stepOutputs.id, output.id))
    .run();
}

test("a custom step's approved output reaches the steps after it in the flow, under its name", () => {
  const ticket = ticketOn(['technical', security, 'implement', 'final_review']);
  approve(ticket.id, 'technical', 'Plan.');
  approve(ticket.id, security, 'No risk.');
  expect(approvedBefore(db, ticket.id, security).map((output) => output.step)).toEqual([
    'technical',
  ]);
  const before = approvedBefore(db, ticket.id, 'implement');
  expect(before).toEqual([
    { step: 'technical', content: 'Plan.' },
    { step: security, content: 'No risk.', name: 'Security pass' },
  ]);
  const prompt = buildPrompt({
    ticket,
    shared: 's',
    instructions: 'i',
    approved: before,
    revision: null,
  });
  expect(prompt).toContain('# Approved: Security pass\n\nNo risk.');
});

test('a custom step after the implementation reads the branch, and the final review gets its report', () => {
  const ticket = ticketOn(['implement', security, 'final_review']);
  expect(runsAfterImplement(ticket, security)).toBe(true);
  expect(runsAfterImplement(ticketOn([security, 'implement', 'final_review']), security)).toBe(
    false,
  );
  approve(ticket.id, 'implement', 'Done.');
  approve(ticket.id, security, 'One risk.');
  expect(approvedBefore(db, ticket.id, 'final_review').map((output) => output.step)).toEqual([
    'implement',
    security,
  ]);
});

test("a custom step's issue comment is titled with its agent's name", () => {
  const ticket = ticketOn([security, 'implement', 'final_review']);
  const output = saveOutput(db, ticket.id, security, 'No risk.');
  expect(
    renderStepComment(ticket.id, security, [output], { [security]: 'Security pass' }),
  ).toContain('### Security pass · v1 · awaiting review');
});
