import { expect, test } from 'bun:test';

import { findingsOf, parseVerdict } from './verdict';

test('the verdict line is found, plain or bold, anywhere at the start of a line', () => {
  expect(parseVerdict('VERDICT: APPROVED\n\nLooks good.')).toBe('approved');
  expect(parseVerdict('## Review\n\n**VERDICT: CHANGES_REQUESTED**\n\n- fix x')).toBe(
    'changes_requested',
  );
  expect(parseVerdict('verdict: changes_requested')).toBe('changes_requested');
  expect(parseVerdict('No verdict here. VERDICT: APPROVED is mentioned inline.')).toBeNull();
});

test('findings are the review without the verdict line', () => {
  expect(findingsOf('VERDICT: CHANGES_REQUESTED\n\n- `math.js`: subtract ignores NaN.')).toBe(
    '- `math.js`: subtract ignores NaN.',
  );
});
