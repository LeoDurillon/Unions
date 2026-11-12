// Tests the follow-up that answers the setup agent's questions.
import { expect, test } from 'bun:test';

import { setupFollowUp } from './setup-follow-up';

test('pairs each question with its answer and asks for the whole proposal again', () => {
  const text = setupFollowUp(
    ['Which compose file?', 'Include GeoReno?'],
    [' dev/compose.yml ', ''],
  );
  expect(text).toContain('- Which compose file?\n  Answer: dev/compose.yml');
  expect(text).toContain('- Include GeoReno?\n  Answer: (not answered: decide from the files)');
  expect(text).toContain('the whole proposal in\nthe same final `json` block');
});
