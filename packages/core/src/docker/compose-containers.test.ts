import { expect, test } from 'bun:test';

import { parseProjectContainers, stoppedServices } from './compose-containers';

const LISTED = [
  'api\texited\tExited (1) 28 minutes ago',
  'db\trunning\tUp 27 minutes (healthy)',
  'web\trestarting\tRestarting (1) 3 seconds ago',
  'seed\texited\tExited (0) 49 minutes ago',
  '',
].join('\n');

test("a project's containers, with the exit code of the stopped ones", () => {
  expect(parseProjectContainers(LISTED)).toEqual([
    { service: 'api', running: false, exitCode: 1 },
    { service: 'db', running: true, exitCode: null },
    { service: 'web', running: true, exitCode: null },
    { service: 'seed', running: false, exitCode: 0 },
  ]);
});

test('an exposed service is stopped when no container of it is up, or it has none', () => {
  const containers = parseProjectContainers(LISTED);
  expect(stoppedServices(['api', 'web', 'conception'], containers)).toEqual([
    { service: 'api', exitCode: 1 },
    { service: 'conception', exitCode: null },
  ]);
  expect(stoppedServices(['db'], containers)).toEqual([]);
});
