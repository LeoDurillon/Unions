import { expect, test } from 'bun:test';

import { helperArgs, removeOnAbort } from './docker-helper';

test('a helper is named only when it must be found again', () => {
  const spec = { image: 'docker:cli', command: ['docker', 'ps'] };
  expect(helperArgs(spec, null)).not.toContain('--name');
  expect(helperArgs(spec, 'union-helper-1').slice(0, 5)).toEqual([
    'run',
    '--rm',
    '-i',
    '--name',
    'union-helper-1',
  ]);
});

test('an abort removes the helper once, even one aborted before', async () => {
  const removed: string[] = [];
  const controller = new AbortController();
  removeOnAbort(controller.signal, () => {
    removed.push('later');
    return Promise.resolve();
  });
  expect(removed).toEqual([]);
  controller.abort();
  controller.abort();
  removeOnAbort(controller.signal, () => Promise.reject(new Error('gone')));
  await Bun.sleep(0);
  expect(removed).toEqual(['later']);
});
