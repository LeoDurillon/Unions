import { expect, test } from 'bun:test';

import { joinChoices, partitionChoices, splitChoices } from './choice-values';

test('multi-select values split on commas and join without repeats', () => {
  expect(splitChoices(' Front, Back ,, {step} ')).toEqual(['Front', 'Back', '{step}']);
  expect(joinChoices(['Front', 'Back', 'Front'])).toBe('Front, Back');
  expect(splitChoices('')).toEqual([]);
});

test('names outside the Notion options are kept apart', () => {
  expect(partitionChoices('Front, {step}, Legacy', ['Front', 'Back'])).toEqual({
    picked: ['Front'],
    other: ['{step}', 'Legacy'],
  });
});
