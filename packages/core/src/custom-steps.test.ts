import { expect, test } from 'bun:test';

import { flowProblems } from './flows';
import { nextStep, transition, type CustomStep, type Flow, type Phase } from './states';
import { stepTitle } from './step-titles';

const SECURITY: CustomStep = 'agent_1';
const API_REVIEW: CustomStep = 'agent_2';

/** The steps a ticket on `flow` runs, approving each one. */
function walk(flow: Flow): string[] {
  let phase: Phase = transition({ kind: 'backlog' }, { type: 'start' }, flow);
  const ran: string[] = [];
  while (phase.kind === 'running') {
    ran.push(phase.step);
    phase = transition(phase, { type: 'run_finished' }, flow);
    phase = transition(phase, { type: 'approve' }, flow);
  }
  expect(phase).toEqual({ kind: 'done' });
  return ran;
}

test('a custom step runs where its flow places it, before or after the implementation', () => {
  expect(walk(['technical', SECURITY, 'implement', 'final_review'])).toEqual([
    'technical',
    SECURITY,
    'implement',
    'final_review',
  ]);
  expect(walk(['implement', API_REVIEW, 'final_review'])).toEqual([
    'implement',
    API_REVIEW,
    'final_review',
  ]);
  expect(nextStep(SECURITY, ['technical', SECURITY, 'implement', 'final_review'])).toBe(
    'implement',
  );
});

test('a step outside the flow goes on with the next built-in step in pipeline order', () => {
  expect(nextStep('summary', ['technical', SECURITY, 'implement', 'final_review'])).toBe(
    'technical',
  );
});

test('changes asked of a custom step run it again', () => {
  const flow: Flow = [SECURITY, 'implement', 'final_review'];
  expect(
    transition({ kind: 'awaiting_approval', step: SECURITY }, { type: 'revise' }, flow),
  ).toEqual({ kind: 'running', step: SECURITY });
});

test('a custom step goes anywhere before the final review, once, if its agent is known', () => {
  const known = [SECURITY, API_REVIEW];
  expect(
    flowProblems([SECURITY, 'technical', 'implement', API_REVIEW, 'final_review'], known),
  ).toEqual([]);
  expect(flowProblems(['implement', 'final_review', SECURITY], known)).toEqual([
    'Final review must be the last step',
  ]);
  expect(flowProblems([SECURITY, 'implement', SECURITY, 'final_review'], known)).toEqual([
    'A custom agent appears twice',
  ]);
  expect(flowProblems(['agent_3', 'implement', 'final_review'], known)).toEqual([
    'Unknown steps: "agent_3"',
  ]);
  expect(flowProblems([SECURITY, 'implement', 'final_review'])).toEqual([
    'Unknown steps: "agent_1"',
  ]);
  expect(flowProblems(['agent_0', 'implement', 'final_review'], known)).toEqual([
    'Unknown steps: "agent_0"',
  ]);
});

test("a custom step is titled with its agent's name, else a placeholder", () => {
  expect(stepTitle(SECURITY, { [SECURITY]: 'Security pass' })).toBe('Security pass');
  expect(stepTitle(API_REVIEW)).toBe('Custom agent');
  expect(stepTitle('final_review')).toBe('Final review');
});
