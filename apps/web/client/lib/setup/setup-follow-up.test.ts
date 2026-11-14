// Tests the follow-ups that answer the setup agent's questions and send it a failed check.
import { expect, test } from 'bun:test';

import { setupFixFollowUp, setupFollowUp } from './setup-follow-up';

test('pairs each question with its answer and asks for the whole proposal again', () => {
  const text = setupFollowUp(
    ['Which compose file?', 'Include GeoReno?'],
    [' dev/compose.yml ', ''],
  );
  expect(text).toContain('- Which compose file?\n  Answer: dev/compose.yml');
  expect(text).toContain('- Include GeoReno?\n  Answer: (not answered: decide from the files)');
  expect(text).toContain('the whole proposal in\nthe same final `json` block');
});

test('sends a failed check: what was tested, the end of its output, and the whole proposal asked again', () => {
  const output = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n');
  const text = setupFixFollowUp('install and check commands', 'Check command: bun test', output);
  expect(text).toStartWith('Union tested your proposed install and check commands and it failed.');
  expect(text).toContain('```\nCheck command: bun test\n```');
  expect(text).toContain('line 99');
  expect(text).not.toContain('line 19\n');
  expect(text).toContain('the whole proposal in\nthe same final `json` block');
});
