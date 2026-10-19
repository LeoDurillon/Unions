import { expect, test } from 'bun:test';

import { canMove, movedStep, withCustomStep, withoutStep, withPlanning } from './flow-edit';
import { flowProblems } from './flows';
import type { CustomStep } from './states';

const SECURITY: CustomStep = 'agent_1';

test('a planning step turned on goes back in pipeline order, the custom steps kept in place', () => {
  const flow = [SECURITY, 'technical', 'implement', 'final_review'] as const;
  expect(withPlanning(flow, 'summary', true)).toEqual([
    SECURITY,
    'summary',
    'technical',
    'implement',
    'final_review',
  ]);
  expect(withPlanning(flow, 'test_plan', true)).toEqual([
    SECURITY,
    'technical',
    'test_plan',
    'implement',
    'final_review',
  ]);
  expect(withPlanning(flow, 'technical', false)).toEqual([SECURITY, 'implement', 'final_review']);
});

test('a custom agent is added before the implementation and moves up to the final review', () => {
  const flow = withCustomStep(['technical', 'implement', 'final_review'], SECURITY);
  expect(flow).toEqual(['technical', SECURITY, 'implement', 'final_review']);
  expect(withCustomStep(flow, SECURITY)).toEqual(flow);
  const after = movedStep(flow, SECURITY, 1);
  expect(after).toEqual(['technical', 'implement', SECURITY, 'final_review']);
  expect(canMove(after, SECURITY, 1)).toBe(false);
  expect(movedStep(after, SECURITY, 1)).toEqual(after);
  expect(movedStep(movedStep(flow, SECURITY, -1), SECURITY, -1)).toEqual([
    SECURITY,
    'technical',
    'implement',
    'final_review',
  ]);
  expect(flowProblems(after, [SECURITY])).toEqual([]);
  expect(withoutStep(after, SECURITY)).toEqual(['technical', 'implement', 'final_review']);
});
