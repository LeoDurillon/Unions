// Tests of which project `n` goes to when the current one has nothing waiting.
import { expect, test } from 'bun:test';

import { nextProjectNeedingYou } from './use-project-jump';

const project = (
  id: number,
  needsYou: number,
): { id: number; counts: { needsYou: number; running: number } } => ({
  id,
  counts: { needsYou, running: 0 },
});

test('the next project with tickets waiting, in sidebar order, wrapping around', () => {
  const projects = [project(1, 2), project(2, 0), project(3, 1)];
  expect(nextProjectNeedingYou(projects, 2)).toBe(3);
  expect(nextProjectNeedingYou(projects, 3)).toBe(1);
  expect(nextProjectNeedingYou(projects, null)).toBe(1);
});

test('none when no other project has anything waiting', () => {
  expect(nextProjectNeedingYou([project(1, 3), project(2, 0)], 1)).toBeNull();
  expect(nextProjectNeedingYou([], null)).toBeNull();
});
