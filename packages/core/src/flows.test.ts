import { expect, test } from 'bun:test';

import { flowName, flowNote, flowProblems, resolveFlow } from './flows';
import { FULL_FLOW } from './states';

test('a flow lists known steps once, in order, with the implementation and the final review', () => {
  expect(flowProblems(['implement', 'final_review'])).toEqual([]);
  expect(flowProblems(['implement', 'technical', 'final_review'])).toEqual([
    'Steps must appear once each, in pipeline order',
  ]);
  expect(flowProblems(['technical', 'implement'])).toEqual(['Every flow runs Final review']);
  expect(flowProblems(['rebase', 'implement', 'final_review'])).toEqual([
    'Unknown steps: "rebase"',
  ]);
  expect(flowProblems('quick')).toEqual(['A flow is a list of steps']);
});

test("a ticket's own flow wins, else the project's default preset, else every step", () => {
  const quick = { baseBranch: 'main', defaultFlow: 'quick' };
  expect(resolveFlow({ flow: ['technical', 'implement', 'final_review'] }, quick)).toEqual([
    'technical',
    'implement',
    'final_review',
  ]);
  expect(resolveFlow({ flow: null }, quick)).toEqual(['implement', 'final_review']);
  expect(resolveFlow({ flow: null }, { baseBranch: 'main' })).toEqual(FULL_FLOW);
  // A project with its own presets no longer offers the built-in ones.
  const own = { baseBranch: 'main', flows: [], defaultFlow: 'quick' };
  expect(resolveFlow({ flow: null }, own)).toEqual(FULL_FLOW);
});

test('the implementer and the final review are told which planning steps were skipped', () => {
  const quick = ['implement', 'final_review'] as const;
  expect(flowNote(quick, 'implement')).toContain('skip planning');
  expect(flowNote(quick, 'implement')).toContain('There is no test plan: add the tests');
  expect(flowNote(quick, 'final_review')).toContain('do not report them as missing');
  const standard = ['technical', 'test_plan', 'implement', 'final_review'] as const;
  expect(flowNote(standard, 'implement')).toContain('no output: Intake, Summary.');
  expect(flowNote(standard, 'implement')).not.toContain('no test plan');
  expect(flowNote(FULL_FLOW, 'implement')).toBe('');
  expect(flowNote(quick, 'rebase')).toBe('');
});

test("a flow is named after the project's preset with the same steps, else Custom", () => {
  const config = { baseBranch: 'main' };
  expect(flowName(['implement', 'final_review'], config)).toBe('Quick');
  expect(flowName(['summary', 'implement', 'final_review'], config)).toBe('Custom');
});
