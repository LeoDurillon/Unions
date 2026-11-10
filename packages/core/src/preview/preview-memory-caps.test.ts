// Tests of the memory cap on each preview service: set when missing, a lower own limit kept, a higher one lowered in its own form.
import { expect, test } from 'bun:test';

import { withResourceCaps } from './preview-memory-caps';

const LIMITS = { memoryMb: 2048, cpuset: '2-7' };

const GB = 1024 * 1024 * 1024;

test('a service without a limit gets the cap, with no swap beyond it', () => {
  const file = withResourceCaps({ services: { app: { image: 'node' } } }, LIMITS);
  expect(file.services).toEqual({
    app: { image: 'node', cpuset: '2-7', mem_limit: String(2 * GB), memswap_limit: String(2 * GB) },
  });
});

test("a service's own lower limit is kept; a higher one is lowered, in the form it uses", () => {
  const file = withResourceCaps(
    {
      services: {
        small: { image: 'a', mem_limit: String(GB / 2) },
        big: { image: 'b', mem_limit: String(3 * GB) },
        deployed: {
          image: 'c',
          deploy: { resources: { limits: { memory: String(3 * GB), cpus: '1' } } },
        },
      },
    },
    LIMITS,
  );
  expect(file.services).toEqual({
    small: { image: 'a', cpuset: '2-7', mem_limit: String(GB / 2), memswap_limit: String(GB / 2) },
    big: { image: 'b', cpuset: '2-7', mem_limit: String(2 * GB), memswap_limit: String(2 * GB) },
    deployed: {
      cpuset: '2-7',
      image: 'c',
      memswap_limit: String(2 * GB),
      deploy: { resources: { limits: { memory: String(2 * GB), cpus: '1' } } },
    },
  });
});

test('a file without services is left as it is', () => {
  expect(withResourceCaps({ name: 'x' }, LIMITS)).toEqual({ name: 'x' });
});

test("a service's own cores are kept", () => {
  const file = withResourceCaps({ services: { db: { image: 'pg', cpuset: '0' } } }, LIMITS);
  expect(file.services).toMatchObject({ db: { cpuset: '0' } });
});
