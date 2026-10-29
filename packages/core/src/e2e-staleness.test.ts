import { expect, test } from 'bun:test';

import { e2eStaleness } from './e2e-staleness';

const RUN_AT = 2000;
const BEFORE = 1000;
const AFTER = 3000;

test('a result newer than the start and the code describes the preview', () => {
  expect(e2eStaleness({ e2eStatus: 'red', e2eAt: RUN_AT, startedAt: BEFORE }, BEFORE)).toBeNull();
});

test('a restart after the run makes it stale', () => {
  expect(e2eStaleness({ e2eStatus: 'red', e2eAt: RUN_AT, startedAt: AFTER }, null)).toContain(
    'restarted',
  );
});

test('an agent run after the run makes it stale, before a restart is considered', () => {
  expect(e2eStaleness({ e2eStatus: 'green', e2eAt: RUN_AT, startedAt: AFTER }, AFTER)).toContain(
    'agent',
  );
});

test('no result, or one running, is never stale', () => {
  expect(e2eStaleness({ e2eStatus: null, e2eAt: null, startedAt: AFTER }, AFTER)).toBeNull();
  expect(e2eStaleness({ e2eStatus: 'running', e2eAt: RUN_AT, startedAt: AFTER }, AFTER)).toBeNull();
});
