// Tests of the docker arguments that cap a container, and of the cores a container is given.
import { expect, test } from 'bun:test';

import { cpusetFor, limitArgs } from './container-limits';

test('memory and memory plus swap are the same, so the container never swaps; its cores and a process cap', () => {
  expect(limitArgs({ memoryMb: 4096, cpuset: '3-8' })).toEqual([
    '--memory',
    '4096m',
    '--memory-swap',
    '4096m',
    '--cpuset-cpus',
    '3-8',
    '--pids-limit',
    '4096',
  ]);
  expect(limitArgs()).toEqual([]);
});

test('a container gets `count` consecutive cores, the same for the same name, within the machine', () => {
  const set = cpusetFor('union-t12', 6, 22);
  const [start = -1, end = -1] = set.split('-').map(Number);
  expect(end - start + 1).toBe(6);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeLessThanOrEqual(21);
  expect(cpusetFor('union-t12', 6, 22)).toBe(set);
});

test('different containers tend to get different cores; asking for more than the machine has gives all', () => {
  const starts = new Set(
    ['union-t1', 'union-t2', 'union-t3', 'union-t4', 'union-a5'].map((name) =>
      cpusetFor(name, 6, 22),
    ),
  );
  expect(starts.size).toBeGreaterThan(1);
  expect(cpusetFor('union-t1', 64, 22)).toBe('0-21');
  expect(cpusetFor('union-t1', 1, 1)).toBe('0-0');
});
